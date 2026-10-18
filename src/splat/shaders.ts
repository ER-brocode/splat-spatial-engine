/**
 * WebGL / WebGPU Shader Sources for 3D Gaussian Splatting rendering
 */

export const WebGLSplatVertexShader = /* glsl */ `
precision highp float;

attribute vec3 position;       // Quad corner [-1, 1]
attribute vec3 splatCenter;    // World center of splat
attribute vec4 splatColor;     // [r, g, b, a]
attribute vec4 splatCovA;      // [cov11, cov12, cov13, cov22]
attribute vec2 splatCovB;      // [cov23, cov33]

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform vec2 focalLength;
uniform vec2 viewportSize;

varying vec4 vColor;
varying vec2 vQuadPos;

void main() {
    vColor = splatColor;
    vQuadPos = position.xy;

    vec4 camPos = modelViewMatrix * vec4(splatCenter, 1.0);
    if (camPos.z >= -0.05) {
        // Splat is behind or clipping camera near plane
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
    }

    // Jacobian of perspective projection at splat center
    // J = [ fx / z,     0,   -(fx * x) / (z * z) ]
    //     [     0,  fy / z,   -(fy * y) / (z * z) ]
    float fx = focalLength.x;
    float fy = focalLength.y;
    float z = -camPos.z;
    float z2 = z * z;

    mat3 J = mat3(
        fx / z, 0.0, 0.0,
        0.0, fy / z, 0.0,
        -(fx * camPos.x) / z2, -(fy * camPos.y) / z2, 0.0
    );

    // 3D Covariance Matrix V in camera space
    // V_cam = W * V_world * W^T where W is the view rotation matrix
    mat3 W = mat3(modelViewMatrix);
    mat3 V_world = mat3(
        splatCovA.x, splatCovA.y, splatCovA.z,
        splatCovA.y, splatCovA.w, splatCovB.x,
        splatCovA.z, splatCovB.x, splatCovB.y
    );

    mat3 V_cam = W * V_world * transpose(W);

    // 2D Covariance in screen space: Sigma' = J * V_cam * J^T
    mat3 cov2D = J * V_cam * transpose(J);

    // Apply low-pass filter (0.33 pixel antialiasing blur)
    cov2D[0][0] += 0.3;
    cov2D[1][1] += 0.3;

    // Eigenvalue decomposition of 2x2 screen covariance
    float a = cov2D[0][0];
    float b = cov2D[0][1];
    float c = cov2D[1][1];

    float trace = a + c;
    float det = a * c - b * b;
    float discriminant = max(0.0, trace * trace - 4.0 * det);
    float term = sqrt(discriminant);

    float lambda1 = 0.5 * (trace + term);
    float lambda2 = 0.5 * (trace - term);

    // Radii of bounding ellipse (3 standard deviations: 99% Gaussian energy)
    float radius1 = ceil(3.0 * sqrt(max(0.0, lambda1)));
    float radius2 = ceil(3.0 * sqrt(max(0.0, lambda2)));
    float maxRadius = max(radius1, radius2);

    // Orientation angle
    float angle = 0.5 * atan(2.0 * b, a - c);
    vec2 dir1 = vec2(cos(angle), sin(angle)) * radius1;
    vec2 dir2 = vec2(-sin(angle), cos(angle)) * radius2;

    vec2 screenOffset = position.x * dir1 + position.y * dir2;
    vec2 ndcOffset = (screenOffset / viewportSize) * 2.0;

    vec4 clipPos = projectionMatrix * camPos;
    clipPos.xy += ndcOffset * clipPos.w;

    gl_Position = clipPos;
}
`;

export const WebGLSplatFragmentShader = /* glsl */ `
precision highp float;

varying vec4 vColor;
varying vec2 vQuadPos;

void main() {
    // Distance from center of billboard quad: [ -1, 1 ]
    float distSq = dot(vQuadPos, vQuadPos);
    if (distSq > 1.0) {
        discard;
    }

    // 2D Gaussian density profile: exp(-0.5 * dist^2 * 9.0)
    // 3 standard deviations = radius 1.0, so 0.5 * (3r)^2 = 4.5 * r^2
    float alpha = exp(-4.5 * distSq) * vColor.a;
    if (alpha < 0.0039) {
        discard;
    }

    gl_FragColor = vec4(vColor.rgb * alpha, alpha);
}
`;

export const WGSLSplatShader = /* wgsl */ `
// WebGPU WGSL Compute and Render pipeline for Volumetric Gaussian Splats

struct Uniforms {
    viewMatrix: mat4x4<f32>,
    projectionMatrix: mat4x4<f32>,
    cameraPosition: vec4<f32>,
    focalLength: vec2<f32>,
    viewportSize: vec2<f32>,
    splatCount: u32,
    padding: u32,
};

struct SplatVertexInput {
    @location(0) quadPos: vec3<f32>,
    @location(1) center: vec3<f32>,
    @location(2) color: vec4<f32>,
    @location(3) covA: vec4<f32>, // cov11, cov12, cov13, cov22
    @location(4) covB: vec2<f32>, // cov23, cov33
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) quadPos: vec2<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn vs_main(input: SplatVertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.color = input.color;
    out.quadPos = input.quadPos.xy;

    let camPos = uniforms.viewMatrix * vec4<f32>(input.center, 1.0);
    if (camPos.z >= -0.05) {
        out.position = vec4<f32>(0.0, 0.0, 2.0, 1.0);
        return out;
    }

    let z = -camPos.z;
    let z2 = z * z;
    let fx = uniforms.focalLength.x;
    let fy = uniforms.focalLength.y;

    // 2D screen covariance estimation
    let cov11 = input.covA.x;
    let cov12 = input.covA.y;
    let cov22 = input.covA.w;

    let a = (fx * fx * cov11) / z2 + 0.3;
    let b = (fx * fy * cov12) / z2;
    let c = (fy * fy * cov22) / z2 + 0.3;

    let trace = a + c;
    let det = a * c - b * b;
    let disc = max(0.0, trace * trace - 4.0 * det);
    let term = sqrt(disc);

    let l1 = 0.5 * (trace + term);
    let l2 = 0.5 * (trace - term);

    let r1 = ceil(3.0 * sqrt(max(0.0, l1)));
    let r2 = ceil(3.0 * sqrt(max(0.0, l2)));

    let angle = 0.5 * atan2(2.0 * b, a - c);
    let dir1 = vec2<f32>(cos(angle), sin(angle)) * r1;
    let dir2 = vec2<f32>(-sin(angle), cos(angle)) * r2;

    let screenOffset = input.quadPos.x * dir1 + input.quadPos.y * dir2;
    let ndcOffset = (screenOffset / uniforms.viewportSize) * 2.0;

    var clipPos = uniforms.projectionMatrix * camPos;
    clipPos.x += ndcOffset.x * clipPos.w;
    clipPos.y += ndcOffset.y * clipPos.w;

    out.position = clipPos;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let distSq = dot(in.quadPos, in.quadPos);
    if (distSq > 1.0) {
        discard;
    }

    let alpha = exp(-4.5 * distSq) * in.color.a;
    if (alpha < 0.0039) {
        discard;
    }

    return vec4<f32>(in.color.rgb * alpha, alpha);
}
`;
