import { MeshStandardMaterial } from "three";

export class Ground extends Mesh {
    constructor(lights) {

        const g = new PlaneGeometry(1, 1);
        const material = new MeshStandardMaterial();

        material.onBeforeCompile = (s) => {
        
            const u = s.uniforms;

            u.lightTexture = lights.lightTexture;
            u.tileTexture = lights.tileTexture;
            u.clusterTexture = lights.tileTexture;
            u.indexTexture = lights.tileTexture;
        
        }

        super(g, material)
        
        this.frustumCulled = false;
        this.rotation.x = -Math.PI/2;
        this.receiveShadow = false;
        this.castShadow = false;
        this.scale.set(1000, 1000, 1000);
        this.renderOrder = 10;
        
    }    
}