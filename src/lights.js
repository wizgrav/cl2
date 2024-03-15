import {  Vector4, BufferGeometry, DataTexture, Float32BufferAttribute, FloatType, Mesh, NearestFilter, PlaneGeometry, RGBAFormat, RGBAIntegerFormat, RawShaderMaterial, RedFormat, RedIntegerFormat, Scene, ShaderChunk, ShaderMaterial, SphereGeometry, UnsignedByteType, UnsignedIntType, UnsignedShortType, Vector2, WebGLRenderTarget, Color } from "three";
import { getDebugMaterial, getListMaterial, getMotionMaterial, getTileMaterial } from "./glsl";


class FullscreenTriangleGeometry extends BufferGeometry {

	constructor() {

		super();

		this.setAttribute( 'position', new Float32BufferAttribute( [ - 1, 3, 0, - 1, - 1, 0, 3, - 1, 0 ], 3 ) );
		this.setAttribute( 'uv', new Float32BufferAttribute( [ 0, 2, 0, 0, 2, 0 ], 2 ) );

	}

}

const tempColor = new Color();
const zeroColor = new Color(0);

export class Lights {

    constructor( renderer, camera, ws ){

        this.renderer = renderer;

        this.hasFloat = renderer.extensions.has("EXT_color_buffer_float");

        this.camera = camera;

        this.wasm = ws.instance;
    
        this.clusterParams = { value: new Vector4() };

        this.subtileWidth = { value: 1 };

        this.subtileHeight = { value: 24 };

        this.masterCount = { value: 1 };

        this._near = 0.01;

        this._far = 0;

        this.tileParams = { value: new Vector4(16, 8, 0, 0) };

        this.projectionMatrix = { value: this.camera.projectionMatrix }
        
        this.time = { value: 0 };
        
        this.lightTexture = { value: null };
        this.tileTexture = { value: null };
        this.listTexture = { value: null };
        
        this.size = { value: new Vector2() };
    
        const proxyGeometry = new PlaneGeometry(2, 2);

        proxyGeometry.isInstancedBufferGeometry = true;
        
        proxyGeometry.instanceCount = 0;
        
        this.proxy = new Mesh(proxyGeometry, getListMaterial());

        //this.proxy = new Mesh(proxyGeometry, getDebugMaterial());

        (["lightTexture", "subtileWidth", "subtileHeight", "clusterParams", "tileParams" , "projectionMatrix", "size"]).forEach((k) => {
            this.proxy.material.uniforms[k] = this[k];    
        });
        
        this.proxy.frustumCulled = false;
        
        this.listScene = new Scene();

        this.listScene.add(this.proxy);

        this.tiler = new Mesh(new FullscreenTriangleGeometry(), getTileMaterial());
        
        (["listTexture", "subtileWidth", "subtileHeight", "masterCount"]).forEach((k) => {
            this.tiler.material.uniforms[k] = this[k];    
        });
        
        this.tiler.frustumCulled = false;

        this.tileScene = new Scene();

        this.tileScene.add( this.tiler );

        if ( this.hasFloat ) {

            this.origTexture = { value: null };

            this.animator = new Mesh(new FullscreenTriangleGeometry(), getMotionMaterial());
            
            this.animator.material.uniforms.origTexture = this.origTexture;
            this.animator.material.uniforms.viewMatrix.value = this.camera.matrixWorldInverse;
            this.animator.material.uniforms.time = this.time;

            this.animator.frustumCulled = false;
            
            this.animatorScene = new Scene();

            this.animatorScene.add( this.animator );

        }

        this.cameraMatrix = null;

        this.computeClusterParams();
    }

    get near() { return this._near; }
    set near( v ) { this._near = v; this.computeClusterParams(); }
    get far() { return this._far; }
    set far( v ) { this._far = v; this.computeClusterParams(); }
    get xSlices() { return this.tileParams.value.x; }
    set xSlices( v ) { this.tileParams.value.x = v + (v & 1); this.computeClusterParams(); }
    get ySlices() { return this.tileParams.value.y; }
    set ySlices( v ) { this.tileParams.value.y = v + (v & 1); this.computeClusterParams(); }
    get zSlices() { return this.subtileHeight.value; }
    set zSlices( v ) { this.subtileHeight.value = v; this.computeClusterParams(); }
 
    //https://www.aortiz.me/2018/12/21/CG.html#clustered-shading
    computeClusterParams() {

        const v = this.clusterParams.value;
        const vt = this.tileParams.value;

        v.x = vt.x / this.size.value.x;
        v.y = vt.y / this.size.value.y;

        const fnl = Math.log( this._far / this._near );

        v.z = this.subtileHeight.value / fnl;
        v.w = this.subtileHeight.value * Math.log( this._near ) / fnl;
    
        vt.z = 2 / ( vt.x * this.subtileWidth.value );
        vt.w = 2 / ( vt.y * this.subtileHeight.value );
        
    }

    patchMaterial(material) {
        material.onBeforeCompile = (s) => {
            material.uniforms = s.uniforms;
            const u = s.uniforms;
    
            u.clusterParams = this.clusterParams;
            u.lightTexture = this.lightTexture;
            u.tileTexture = this.tileTexture;
            u.listTexture = this.listTexture;
            u.subtileWidth = this.subtileWidth;
            u.subtileHeight = this.subtileHeight;
            u.masterCount = this.masterCount;
        }
    }

    patchShader(s) {
        
        const u = s.uniforms;

        u.clusterParams = this.clusterParams;
        u.lightTexture = this.lightTexture;
        u.tileTexture = this.tileTexture;
        u.listTexture = this.listTexture;
        u.subtileWidth = this.subtileWidth;
        u.subtileHeight = this.subtileHeight;
        u.masterCount = this.masterCount;
        
    }

    config(lights) {

        this.wasm.exports.init(lights.length);

        lights.forEach((l, i) => {
            
            const p = l.position;
            
            const c = l.color;
            
            this.wasm.exports.add(p.x, p.y, p.z, 3, c.r, c.g, c.b, c.a, Math.random() * (Math.floor(i / 4) & 1 ? -1 : 1), 1.5 + Math.random())
        
        });

        this.wasm.exports.sort();

        this.subtileWidth.value = Math.ceil(lights.length / 32);

        this.cameraMatrix = new Float32Array(this.wasm.exports.memory.buffer, this.wasm.exports.getCameraMatrix(), 16);
        
        this.lightCount = lights.length;
    
        this.masterCount.value = Math.ceil( lights.length / 1024 );

        if ( this.hasFloat ) {
    
            this.wasm.exports.raw();
            this.origTexture.value = new DataTexture( new Float32Array(this.wasm.exports.memory.buffer, this.wasm.exports.getLightTexture(), lights.length * 4 * 2), 2 * lights.length, 1, RGBAFormat, FloatType);
            this.origTexture.value.minFilter = NearestFilter;
            this.origTexture.value.magFilter = NearestFilter;
            this.origTexture.value.needsUpdate = true;
        } else {
        
            this.lightTexture.value = new DataTexture( new Float32Array(this.wasm.exports.memory.buffer, this.wasm.exports.getLightTexture(), lights.length * 4 * 2), 2 * lights.length, 1, RGBAFormat, FloatType);
            this.lightTexture.value.minFilter = NearestFilter;
            this.lightTexture.value.magFilter = NearestFilter;

        }
    
        this.proxy.geometry.instanceCount = lights.length;

    }

    update( time ) {

        if ( this.hasFloat ) { 

            this.time.value = time;
    
        } else {

            this.cameraMatrix.set( this.camera.matrixWorldInverse.elements );

            this.wasm.exports.update(time);

            this.lightTexture.value.needsUpdate = true;
        
        }

        this.renderTiles();

    }

    renderTiles() {

        const oldRT = this.renderer.getRenderTarget();
        
        this.renderer.getClearColor(tempColor);
        
        const alpha = this.renderer.getClearAlpha();
        
        this.renderer.setClearColor(zeroColor, 0);

        let RT;

        if ( this.hasFloat ) {
        
            RT = this.getLightTarget();

            this.renderer.setRenderTarget(RT);

            this.renderer.render( this.animatorScene, this.camera );
            
            this.lightTexture.value = RT.texture;
        
        }
        
        RT = this.getListTarget();

        this.renderer.setRenderTarget(RT);

        this.renderer.clear( true, false, false );
        
        this.renderer.render( this.listScene, this.camera );
   
        this.listTexture.value = RT.texture;
        
        RT = this.getTileTarget();

        this.renderer.setRenderTarget(RT);

        this.renderer.render( this.tileScene, this.camera );
   
        this.tileTexture.value = RT.texture;

        this.renderer.setRenderTarget(oldRT);
        this.renderer.setClearColor(tempColor, alpha);
    
    }

    resize(size) {

        this.size.value = size;
        
        delete this.tileTarget;
        
        delete this.listTarget;
    
        this.computeClusterParams();
    }

    getLightTarget() {

        let rt = this.lightTarget;

        if( ! rt ) {

            rt = new WebGLRenderTarget( 2 * this.lightCount, 1, { 
                format: RGBAFormat, 
                type: FloatType, 
                depthBuffer: false, 
                stencilBuffer: false,
                minFilter: NearestFilter,
                magFilter: NearestFilter,
                generateMipmaps: false
            });

            this.lightTarget = rt;
        }

        return rt;

    }

    getListTarget() {

        let rt = this.listTarget;

        if( ! rt ) {
            const tp = this.tileParams.value;
            rt = new WebGLRenderTarget( tp.x * this.subtileWidth.value, tp.y * this.subtileHeight.value, { 
                format: RGBAFormat, 
                type: UnsignedByteType, 
                depthBuffer: false, 
                stencilBuffer: false,
                minFilter: NearestFilter,
                magFilter: NearestFilter,
                generateMipmaps: false
            });

            this.listTarget = rt;
        }

        return rt;

    }

    getTileTarget() {

        let rt = this.tileTarget;

        if( ! rt ) {

            const tw = this.subtileWidth.value;
            const tp = this.tileParams.value;
            
            rt = new WebGLRenderTarget( tp.x * this.subtileHeight.value, tp.y * this.masterCount.value, { 
                format: RedIntegerFormat, 
                type: tw > 16 ? UnsignedIntType : ( tw > 8 ? UnsignedShortType : UnsignedByteType), 
                depthBuffer: false, 
                stencilBuffer: false,
                minFilter: NearestFilter,
                magFilter: NearestFilter,
                generateMipmaps: false,
                internalFormat: tw > 16 ? "R32UI" : ( tw > 8 ? "R16UI" : "R8UI")
            });

            this.tileTarget = rt;
        }

        return rt;

    }


}