import { BufferGeometryLoader, Color, DynamicDrawUsage, Group, InstancedMesh, MeshStandardMaterial } from "three";
import gson from '../suzanne.json';
import { MeshBasicMaterial } from "three";

export class Model extends InstancedMesh {
    
    constructor(lights, ws, count) {

        const loader = new BufferGeometryLoader();

        const geometry = loader.parse( gson );

        geometry.computeVertexNormals();

        
        const material = new MeshStandardMaterial();

        material.onBeforeCompile = (s) => {
            lights.patchShader(s);
            s.fragmentShader = `//glsl
            
            float Rand(vec2 co){
                return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
            }

            ` + s.fragmentShader.replace("#include <lights_fragment_begin>", `//glsl
                material.specularF90 += Rand(vColor.rb);
                material.roughness = Rand(vColor.gr);

                #include <lights_fragment_begin>

            `)
        };

        //lights.patchMaterial(material);


//const material = new MeshBasicMaterial;
        super(geometry, material, count);

        this.instanceMatrix.setUsage( DynamicDrawUsage );

        this.setColorAt(0, new Color());

        this.instanceColor.setUsage( DynamicDrawUsage );

        this.wasm = ws.instance;

        this.lights = lights;

        this.frustumCulled = false;

        

        
    }

    config(arr) {
        
        this.wasm.exports.init();
        
        arr.forEach((o) => {

            const p = o.position;
            const c = o.color;
            
            this.wasm.exports.spawn(p.x, p.y, p.z, c.r, c.g, c.b, o.scale);

        });

        this.instanceMatrix.array = new Float32Array(this.wasm.exports.memory.buffer, this.wasm.exports.getInstanceMatrices(), this.count * 16);

        this.instanceColor.array = new Float32Array(this.wasm.exports.memory.buffer, this.wasm.exports.getInstanceColors(), this.count * 3);

        this.cameraMatrix = new Float32Array(this.wasm.exports.memory.buffer, this.wasm.exports.getCameraMatrix(), 16);
    
    }

    update( ) {
    
        if( ! this.visible ) return;

        this.cameraMatrix.set( this.lights.camera.matrixWorldInverse.elements );
        
        this.count = this.wasm.exports.update( );
    
        this.instanceMatrix.needsUpdate = true;

        this.instanceColor.needsUpdate = true;
        
    }

}