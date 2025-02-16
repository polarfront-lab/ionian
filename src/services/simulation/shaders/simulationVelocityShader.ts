export default `
uniform float uProgress;
uniform vec4 uInteractionPosition;
uniform float uTime;
uniform float uTractionForce;
uniform float uMaxRepelDistance;

float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    float offset = rand(uv);

    vec3 position = texture2D(uCurrentPosition, uv).xyz;
    vec3 velocity = texture2D(uCurrentVelocity, uv).xyz;
    vec3 mixedPosition = texture2D(uMixedPosition, uv).xyz;

    velocity *= 0.9;

    // particle traction
    vec3 direction = normalize(mixedPosition - position); // direction vector
    float dist = length ( mixedPosition - position ); // distance from where it was supposed to be, and currently are.
    if (dist > 0.01) {
        position += direction * 0.1 * uTractionForce; // uTractionForce defaults to 0.1
    }

    // mouse repel force
    float pointerDistance = distance(position, uInteractionPosition.xyz);
    float mouseRepelModifier = clamp(uMaxRepelDistance - pointerDistance, 0.0, 1.0);
    float normalizedDistance = pointerDistance / uMaxRepelDistance;
    float repulsionStrength = (1.0 - normalizedDistance) * uInteractionPosition.w;
    direction = normalize(position - uInteractionPosition.xyz);
    velocity += (direction * 0.01 * repulsionStrength) * mouseRepelModifier;

    float lifespan = 20.0;
    float age = mod(uTime + lifespan * offset, lifespan);

    if (age < 0.1) {
        position.xyz = mixedPosition;
    }

    gl_FragColor = vec4(velocity, 1.0);
}
`