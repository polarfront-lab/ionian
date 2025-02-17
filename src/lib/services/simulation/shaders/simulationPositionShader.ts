export default `
uniform float uProgress;
uniform vec4 uInteractionPosition;
uniform float uTime;
uniform float uTractionForce;

float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {

    // in GPGPU, we calculate the uv on each fragment shader, not using the static varying passed over from the v shader.
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    float offset = rand(uv);

    vec3 position = texture2D(uCurrentPosition, uv).xyz;
    vec3 velocity = texture2D(uCurrentVelocity, uv).xyz;
    vec3 mixedPosition = texture2D(uMixedPosition, uv).xyz;

    // particle attraction to original position.
    vec3 direction = normalize(mixedPosition - position); // direction vector
    float dist = length ( mixedPosition - position ); // distance from where it was supposed to be, and currently are.

    if (dist > 0.01) {
        position = mix(position, mixedPosition, 0.1 * uTractionForce); // 0.1 ~ 0.001 (faster, slower)
    }

    position += velocity;
    gl_FragColor = vec4(position, 1.0);
}
`;
