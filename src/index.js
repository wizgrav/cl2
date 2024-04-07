


import {ACESFilmicToneMapping, Clock, Color, DoubleSide, FrontSide, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, Vector2, Vector3, Vector4, WebGLRenderer } from 'three';
import { Lights } from './lights';
import { Model } from './model';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AmbientLight } from 'three';
import { Wisp } from './wisp';
import ui from './ui.js';


import { FPS, Query } from './query.js';

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

const camera = new PerspectiveCamera( 50, window.innerWidth / window.innerHeight, 0.01, 1000 );


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


renderer.xr.enabled = true;

const world = new Scene();


ui(params, renderer);


world.add( new AmbientLight(0x666666, 0.1) );

let lights, model, wisp;

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
    
                larr.push({ position: new Vector3( i * 4, 0.66 + Math.random() * 0.42 + k * 0.66 , j * 4), color: new Color().setHSL(Math.random(), 0.66, 0.5) })

            }
        }

    }

    larr = shuffle(larr);

    lights.config(larr, params.get("shuffle") === "1" );
    
    model.config(marr, SIZE);
    
    wisp.count = larr.length;

    controls.target.copy(center).multiplyScalar(1/( SIZE * SIZE));
    controls.target.y = 1.75;

    controls.maxDistance =  4 * SIZE;
    controls.update();

    lights.far = 6.4 * SIZE;
    lights.near = 1;
}

Promise.all([ 
    WebAssembly.instantiateStreaming(fetch('lights.wasm'), { js: { mem: new WebAssembly.Memory({ initial: 1, maximum: 20 }) } }),
    WebAssembly.instantiateStreaming(fetch('model.wasm'), { js: { mem: new WebAssembly.Memory({ initial: 1, maximum: 20 }) } })
]).then( 
        (objs) => { 
    lights = new Lights(renderer, objs[0]);
    
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

    world.onBeforeRender = (renderer, scene, camera, rt) => {

        lights.update( time, camera );
    
        model.update(camera);
    
        query.start();

    }

    world.onAfterRender = (renderer, scene, camera) => {
        
        query.end(time);
    
    }
});

function onWindowResize() {

    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height
    camera.updateProjectionMatrix()

    renderer.setSize(width, height);
    
    const size = new Vector2();
    
    renderer.getDrawingBufferSize(size);
    
    if(lights) lights.resize( size );
    
}

window.addEventListener( 'resize', onWindowResize );

onWindowResize();

const clock = new Clock(true);

let time = 0;

const query = new Query(renderer, "#shade .value");
const fps = new FPS("#fps", "#minFps", "#maxFps");



renderer.setAnimationLoop(() => {
    
    const delta = clock.getDelta();
    time += delta;

    fps.update(time);

    if( lights ) {
        
        controls.update(delta);

    }

    
    renderer.clear(true, true, false);

    renderer.render(world, camera);

});