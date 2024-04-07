import {  Vector4, BufferGeometry, DataTexture, Float32BufferAttribute, FloatType, Mesh, NearestFilter, PlaneGeometry, RGBAFormat, RGBAIntegerFormat, RawShaderMaterial, RedFormat, RedIntegerFormat, Scene, ShaderChunk, ShaderMaterial, SphereGeometry, UnsignedByteType, UnsignedIntType, UnsignedShortType, Vector2, WebGLRenderTarget, Color, ArrayCamera, PerspectiveCamera } from "three";
import { getListMaterial, getMasterMaterial, lights_fragment_begin, lights_physical_pars_fragment } from "./glsl";
import { Query } from "./query";


class FullscreenTriangleGeometry extends BufferGeometry {

	constructor() {

		super();

		this.setAttribute( 'position', new Float32BufferAttribute( [ - 1, 3, 0, - 1, - 1, 0, 3, - 1, 0 ], 3 ) );
	
	}

}

const tempColor = new Color();
const zeroColor = new Color(0);

export class Lights {

    constructor( renderer, ws ){

        this.renderer = renderer;

        this.wasm = ws.instance;
    
        this.clusterParams = { value: new Vector4() };

        this.batchCount = { value: 1 };

        this.masterCount = { value: 1 };

        this.camera = new PerspectiveCamera();

        this._near = 0.01;

        this._far = 1;

        this.sliceParams = { value: new Vector4(32, 16, 32, 1) };

        this.projectionMatrix = { value: null };

        this.viewMatrix = { value: null }
        
        this.nearZ = { value: 0 };

        this.time = { value: 0 };
        
        this.lightTexture = { value: null };
        this.masterTexture = { value: null };
        this.listTexture = { value: null };
        
        this.size = { value: new Vector2() };
    
        const proxyGeometry = new PlaneGeometry(2, 2);

        proxyGeometry.isInstancedBufferGeometry = true;
        
        proxyGeometry.instanceCount = 0;
        
        

        this.proxy = new Mesh(proxyGeometry, getListMaterial());
 
        (["lightTexture", "batchCount", "sliceParams", "clusterParams", "nearZ", "projectionMatrix"]).forEach((k) => {
            this.proxy.material.uniforms[k] = this[k];
        });
        
        this.proxy.frustumCulled = false;
        
        this.listScene = new Scene();

        this.listScene.add(this.proxy);

        this.tiler = new Mesh(new FullscreenTriangleGeometry(), getMasterMaterial());
        
        (["listTexture", "batchCount", "sliceParams"]).forEach((k) => {
            this.tiler.material.uniforms[k] = this[k];    
        });
        
        this.tiler.frustumCulled = false;

        this.tileScene = new Scene();

        this.tileScene.add( this.tiler );

        this.cameraMatrix = null;

        this.computeClusterParams();

        this.query = new Query(this.renderer, "#assign .value");
    }

    get near() { return this._near; }
    set near( v ) { this._near = v; this.computeClusterParams(); }
    get far() { return this._far; }
    set far( v ) { this._far = v; this.computeClusterParams(); }
    
    slice(x, y, z) {
        const v = this.sliceParams.value;
        v.x = x;
        v.y = y;
        v.z = z;
        this.computeClusterParams();
    }

    //https://www.aortiz.me/2018/12/21/CG.html#clustered-shading
    computeClusterParams() {

        const v = this.clusterParams.value;
        const vt = this.sliceParams.value;

        v.x = vt.x / this.size.value.x;
        v.y = vt.y / this.size.value.y;

        const fnl = Math.log( this._far / this._near );

        v.z = this.sliceParams.value.z / fnl;
        v.w = this.sliceParams.value.z * Math.log( this._near ) / fnl;
        
    }

    patchMaterial(material) {
        material.onBeforeCompile = (s) => {

            this.patchShader(s);
            material.uniforms = s.uniforms;
        }
    }

    patchShader(s) {
        
        const u = s.uniforms;

        u.clusterParams = this.clusterParams;
        u.sliceParams = this.sliceParams;
        u.lightTexture = this.lightTexture;
        u.masterTexture = this.masterTexture;
        u.listTexture = this.listTexture;
        
        s.fragmentShader = s.fragmentShader.replace('#include <lights_physical_pars_fragment>', `
            #include <lights_physical_pars_fragment>
            ${lights_physical_pars_fragment}
        `).replace('#include <lights_fragment_begin>', `
            #include <lights_fragment_begin>
            ${lights_fragment_begin}
        `)
    }

    config(lights, shuffle) {

        this.wasm.exports.init(lights.length);

        lights.forEach((l, i) => {
            
            const p = l.position;
            
            const c = l.color;
            
            this.wasm.exports.add(p.x, p.y, p.z, 3, c.r, c.g, c.b, c.a, Math.random() * (Math.floor(i / 4) & 1 ? -1 : 1), 1.5 + Math.random())
        
        });

        if ( ! shuffle ) this.wasm.exports.sort();

        this.batchCount.value = Math.ceil(lights.length / 32);

        this.cameraMatrix = new Float32Array(this.wasm.exports.memory.buffer, this.wasm.exports.getCameraMatrix(), 16);
        
        this.lightCount = lights.length;
    
        this.sliceParams.value.w = Math.ceil( lights.length / 1024 );

        this.lightTexture.value = new DataTexture( new Float32Array(this.wasm.exports.memory.buffer, this.wasm.exports.getLightTexture(), lights.length * 4 * 2), 2 * lights.length, 1, RGBAFormat, FloatType);
        this.lightTexture.value.minFilter = NearestFilter;
        this.lightTexture.value.magFilter = NearestFilter;

        this.computeClusterParams();

    }

    update( time, camera ) {

        this.nearZ.value = camera.near;

        this.projectionMatrix.value = camera.projectionMatrix;

        this.viewMatrix.value = camera.matrixWorldInverse;

        this.proxy.geometry.instanceCount = this.lightCount;
       
        this.cameraMatrix.set( this.viewMatrix.value.elements );

        this.wasm.exports.update(time);

        this.lightTexture.value.needsUpdate = true;

        this.renderTiles(time);

    }

    renderTiles( time ) {

        const oldRT = this.renderer.getRenderTarget();
        
        this.renderer.getClearColor(tempColor);
        
        const alpha = this.renderer.getClearAlpha();
        
        this.renderer.setClearColor(zeroColor, 0);

        this.query.start();

        // Generate list texture
        let RT = this.getListTarget();

        this.renderer.setRenderTarget(RT);

        this.renderer.clear( true, false, false );
        
        this.renderer.render( this.listScene, this.camera );
   
        this.listTexture.value = RT.texture;
        
        // Gather into master texture
        RT = this.getMasterTarget();

        this.renderer.setRenderTarget(RT);

        this.renderer.clear( true, false, false );

        this.renderer.render( this.tileScene, this.camera );
   
        this.masterTexture.value = RT.texture;

        this.renderer.setRenderTarget(oldRT);
        this.renderer.setClearColor(tempColor, alpha);
    
        this.query.end(time);
        
    }

    resize(size) {

        this.size.value = size;
        
        delete this.masterTarget;
        
        delete this.listTarget;
    
        this.computeClusterParams();
    }

    getListTarget() {

        let rt = this.listTarget;

        if( ! rt ) {
            const tp = this.sliceParams.value;
            rt = new WebGLRenderTarget( tp.x * tp.z, tp.y * this.batchCount.value, { 
                format: RGBAFormat, 
                type: UnsignedByteType, 
                depthBuffer: false, 
                stencilBuffer: false,
                minFilter: NearestFilter,
                magFilter: NearestFilter,
                generateMipmaps: false,
                samples: 0
            });

            this.listTarget = rt;
        }

        return rt;

    }

    getMasterTarget() {

        let rt = this.masterTarget;

        if( ! rt ) {

            const tw = this.batchCount.value;
            const tp = this.sliceParams.value;
            
            rt = new WebGLRenderTarget( tp.x * tp.z, tp.y * tp.w, { 
                format: RedIntegerFormat, 
                type: tw > 16 ? UnsignedIntType : ( tw > 8 ? UnsignedShortType : UnsignedByteType), 
                depthBuffer: false, 
                stencilBuffer: false,
                minFilter: NearestFilter,
                magFilter: NearestFilter,
                generateMipmaps: false,
                samples: 0,
                internalFormat: tw > 16 ? "R32UI" : ( tw > 8 ? "R16UI" : "R8UI")
            });

            this.masterTarget = rt;
        }

        return rt;

    }


}