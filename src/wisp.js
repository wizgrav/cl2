import { Mesh, ShaderMaterial, AdditiveBlending, PlaneGeometry } from "three";

const material = new ShaderMaterial({

    transparent: true,

    blending: AdditiveBlending,

    premultipliedAlpha: true,

    depthTest: true,

    depthWrite: false,

    uniforms: {
        lightTexture: null
    },

    vertexShader: `//glsl

        uniform sampler2D lightTexture;

        varying vec4 vColor;

        varying vec3 vPosition;

        void main() {

            int index = 2 * gl_InstanceID;

            vec4 offset = texelFetch( lightTexture, ivec2(index, 0), 0 );

            vColor = texelFetch( lightTexture, ivec2(index + 1, 0), 0 );
            
            vPosition = position.xyz;

            gl_Position = projectionMatrix * vec4( position.xyz * offset.w * 0.2 + offset.xyz, 1. );

        }
    `,

    fragmentShader: `//glsl
        varying vec4 vColor;

        varying vec3 vPosition;

        void main() {

            float len = length(vPosition.xy);

            float a = smoothstep(0.045, 0.05, len);
            float b = smoothstep(0.5, 0.025, len);

            gl_FragColor.rgb = mix(vec3(1.), vColor.rgb * pow(b, 12.), a );
            gl_FragColor.a = 0.;
        }
    `
})

export class Wisp extends Mesh {
    constructor(lights) {
        const geometry = new PlaneGeometry(1, 1);
        geometry.isInstancedBufferGeometry = true;
        geometry.instanceCount = 0;
        super(geometry, material);
        this.frustumCulled = false;
        
        this.material.onBeforeCompile = (s) => {
            s.uniforms.lightTexture = lights.lightTexture;
        }
    }

    get count() {
        return this.geometry.instanceCount;
    }

    set count(v) {
        this.geometry.instanceCount = v;
    }
}