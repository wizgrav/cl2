import { BufferGeometryLoader, Color, DataTexture, DynamicDrawUsage, FloatType, Group, InstancedBufferAttribute, InstancedMesh, Mesh, MeshStandardMaterial, NearestFilter, RGBAFormat } from "three";
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

        this.sideWidth = { value: 1 };

        material.onBeforeCompile = (s) => {
            lights.patchShader(s);

            s.uniforms.sideWidth = this.sideWidth;

            s.vertexShader = `//glsl 
                
                uniform float sideWidth;
                attribute vec4 instanceColor;
                
                varying vec3 vColor;

            ` + s.vertexShader.replace("#include <project_vertex>", `//glsl
                
                    transformed.xz += 4. * vec2( floor( instanceColor.w / sideWidth), mod( instanceColor.w, sideWidth) );
                    
                    vColor = instanceColor.rgb;  

                    #include <project_vertex>

            `);

            s.fragmentShader = `//glsl
             varying vec3 vColor;

            float Rand(vec2 co){
                return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
            }

            ` + s.fragmentShader.replace("#include <lights_fragment_begin>", `//glsl
                float m = Rand(vColor.rb);
                material.specularF90 = 1.0;
                material.roughness = max(0.01, Rand(vColor.gr));
                material.diffuseColor = vColor.rgb * ( 1.0 - m ) ;
                material.specularColor = mix( vec3( 0.04 ), vColor.rgb, m );
	
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

        this.instanceColors = new InstancedBufferAttribute( new Float32Array(this.wasm.exports.memory.buffer, this.wasm.exports.getInstanceColors(), arr.length * 4), 4);

        this.instanceColors.setUsage(DynamicDrawUsage);
        
        this.geometry.setAttribute("instanceColor", this.instanceColors);

        this.cameraMatrix = new Float32Array(this.wasm.exports.memory.buffer, this.wasm.exports.getCameraMatrix(), 16);
    
    }

    update( ) {
    
        if( ! this.visible ) return;

        this.cameraMatrix.set( this.lights.cameraMatrix );
        
        const count = this.wasm.exports.update();
        
        this.geometry.instanceCount = count;

        this.instanceColors.addUpdateRange(0, count * 4);
        
        this.instanceColors.needsUpdate = true;
        
    }

}