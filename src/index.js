


import {ACESFilmicToneMapping, Clock, Color, DoubleSide, FrontSide, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, Vector2, Vector3, Vector4, WebGLRenderer } from 'three';
import { Lights } from './lights';
import { Model } from './model';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AmbientLight } from 'three';
import { Wisp } from './wisp';
import ui from './ui.js';

import Stats from 'three/examples/jsm/libs/stats.module.js';

const params = new URLSearchParams(window.location.search);

const SIZE = parseInt( params.get("size") || 16 ); 

const Screenshot = params.get("shot") === "1";

const renderer = new WebGLRenderer({ 
    alpha: false,
    stencil: false,
    antialias: params.get("msaa") === "1",
    preserveDrawingBuffer: Screenshot,
    powerPreference: "high-performance"
});
      
ui(params, renderer);

function DownloadCanvasAsImage(){
    let downloadLink = document.createElement('a');
    downloadLink.setAttribute('download', 'promo.png');
    let canvas = document.querySelector('canvas');
    let dataURL = canvas.toDataURL('image/png');
    let url = dataURL.replace(/^data:image\/png/,'data:application/octet-stream');
    downloadLink.setAttribute('href', url);
    downloadLink.click();
}

if( Screenshot ) window.addEventListener("keydown", DownloadCanvasAsImage);

renderer.autoClear = false;
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.toneMapping = ACESFilmicToneMapping;
renderer.domElement.tabIndex = 0;

document.body.appendChild(renderer.domElement);

const camera = new PerspectiveCamera( 50, window.innerWidth / window.innerHeight, 0.1, 1000 );


const controls = new OrbitControls( camera, renderer.domElement );
controls.target = new Vector3(0, 1.75, 0);
controls.enableDamping = true;
controls.maxDistance = 50;
controls.minDistance = 1;
controls.maxPolarAngle = Math.PI / 2;
controls.minPolarAngle = 0;
controls.enabled = true;

camera.position.set(10, 50, 10);
camera.lookAt(10, 0, 10);

window.camera = camera;

const world = new Scene();

world.add( new AmbientLight(0x666666, 0.1) );

let lights, model, wisp, stats;

function shuffle(array) {
    let currentIndex = array.length,  randomIndex;
  
    while (currentIndex > 0) {
  
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
  
      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex], array[currentIndex]];
    }
  
    return array;
  }

function config() {

    let larr = [];
    let marr = [];
    
    const center = new Vector3(0, 1.75, 0);
    
    
    for(let i = 0; i < SIZE; i++) {
        
        for(let j = 0; j < SIZE; j++) {

            const pos = new Vector3(i * 4, 0 , j * 4);
            marr.push( { position: pos, color: new Color( Math.random(), Math.random(), Math.random() ), index: i * SIZE + j } );
            center.x += pos.x;
            center.z += pos.z;
            
            for(let k = 0; k < 4; k++) {
    
                larr.push({ position: new Vector3( i * 4, 0.6 + Math.random() * 0.4 + k * 0.6 , j * 4), color: new Color().setHSL(Math.random(), 0.66, 0.5) })

            }
        }

    }

    larr = shuffle(larr);

    lights.config(larr, params.get("shuffle") === "1" );
    
    model.config(marr, SIZE);
    
    wisp.count = larr.length;

    controls.target.copy(center).multiplyScalar(1/( SIZE * SIZE));
    controls.target.y = 1.75;

    controls.maxDistance =  3 * SIZE;
    controls.update();

}

Promise.all([ 
    WebAssembly.instantiateStreaming(fetch('lights.wasm'), { js: { mem: new WebAssembly.Memory({ initial: 1, maximum: 20 }) } }),
    WebAssembly.instantiateStreaming(fetch('model.wasm'), { js: { mem: new WebAssembly.Memory({ initial: 1, maximum: 20 }) } })
]).then( 
        (objs) => { 
    lights = new Lights(renderer, camera, objs[0]);
    
    lights.far = 6 * SIZE;
    
    model = new Model(lights, objs[1], SIZE * SIZE);

    model.position.y = 1.5;

    model.visible = params.get("model") !== "0";

    world.add( model );

    const ground = new Mesh( new PlaneGeometry(1,1), new MeshStandardMaterial({ color: 0xFFFFFF, side: FrontSide } ));
    ground.rotation.x = -Math.PI / 2;
    ground.scale.multiplyScalar(1000);
    ground.renderOrder = 10;
    lights.patchMaterial(ground.material);
    world.add( ground );

    onWindowResize();

    wisp = new Wisp(lights);
    
    wisp.visible = params.get("wisp") !== "0";

    world.add(wisp);

    config();

    stats = new Stats();
	document.body.appendChild( stats.dom );
        
    
});

//world.add(camera);

function onWindowResize() {

    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height
    camera.updateProjectionMatrix()

    renderer.setSize(width, height);
    //renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    const size = new Vector2();
    
    renderer.getDrawingBufferSize(size);
    
    if(lights) lights.resize( size );
    
}

window.addEventListener( 'resize', onWindowResize );

onWindowResize();

const clock = new Clock(true);

const cameraPosition = new Vector3();

const cameraDirection = new Vector3();

let time = 0;

renderer.setAnimationLoop(() => {
    
    const delta = clock.getDelta();
    time += delta;

    renderer.clear(true, true, false);
       
    if( lights ) {
        
        controls.update(delta);

        camera.updateMatrixWorld( true );

        camera.getWorldDirection(cameraDirection);

        camera.getWorldPosition(cameraPosition);

        lights.update( time );

        model.update(cameraPosition, cameraDirection);

        stats.update();

    }

    //renderer.clear(true, true, false);

    renderer.render(world, camera);

});