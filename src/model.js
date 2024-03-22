import { BufferGeometryLoader, Color, DataTexture, DynamicDrawUsage, FloatType, Group, InstancedMesh, Mesh, MeshStandardMaterial, NearestFilter, RGBAFormat } from "three";
import gson from '../suzanne.json';
import { MeshBasicMaterial } from "three";

export class Model extends Mesh {
    
    constructor(lights, ws) {

        const loader = new BufferGeometryLoader();

        const geometry = loader.parse( gson );

        geometry.computeVertexNormals();
        
        geometry.isInstancedBufferGeometry = true;
        
        geometry.instanceCount = 0;

        const material = new MeshStandardMaterial({ dithering: true });

        super(geometry, material);

        this.instanceTexture = { value: null };

        this.sideWidth = { value: 1 };

        material.onBeforeCompile = (s) => {
            lights.patchShader(s);

            s.uniforms.sideWidth = this.sideWidth;

            s.uniforms.instanceTexture = this.instanceTexture;
            
            s.vertexShader = `//glsl 
                
                uniform float sideWidth;
                uniform sampler2D instanceTexture;

                varying vec3 vColor;

            ` + s.vertexShader.replace("#include <project_vertex>", `//glsl
                
                    
                    vec4 tx = texelFetch( instanceTexture, ivec2( gl_InstanceID, 0 ), 0 );
                    
                          
                    transformed.xz += 4. * vec2( floor( tx.w / sideWidth), mod( tx.w, sideWidth) );
                    
                    vColor = tx.rgb;  

                    #include <project_vertex>

            `);

            s.fragmentShader = `//glsl
             varying vec3 vColor;

            float Rand(vec2 co){
                return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
            }

            ` + s.fragmentShader.replace("#include <lights_fragment_begin>", `//glsl
                material.specularF90 = min( 0.96, material.specularF90 + Rand(vColor.rb) );
                material.roughness = Rand(vColor.gr);
                material.diffuseColor = vColor;
                #include <lights_fragment_begin>

            `)
        };

        this.wasm = ws.instance;

        this.lights = lights;

        this.frustumCulled = false;

    }

    config(arr, side) {
        
        this.sideWidth.value = side;

        this.wasm.exports.init();
        
        arr.forEach((o) => {

            const p = o.position;
            const c = o.color;
            
            this.wasm.exports.spawn(p.x, p.y, p.z, c.r, c.g, c.b, o.index);

        });

        this.instanceTexture.value = new DataTexture( new Float32Array(this.wasm.exports.memory.buffer, this.wasm.exports.getInstanceColors(), arr.length * 4), arr.length, 1, RGBAFormat, FloatType);
        this.instanceTexture.value.minFilter = NearestFilter;
        this.instanceTexture.value.magFilter = NearestFilter;
        this.instanceTexture.value.needsUpdate = true;
        this.cameraMatrix = new Float32Array(this.wasm.exports.memory.buffer, this.wasm.exports.getCameraMatrix(), 16);
    
    }

    update( ) {
    
        if( ! this.visible ) return;

        this.cameraMatrix.set( this.lights.camera.matrixWorldInverse.elements );
        
        this.geometry.instanceCount = this.wasm.exports.update();
    
        this.instanceTexture.value.needsUpdate = true;
        
    }

}