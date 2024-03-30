import { MathUtils } from "three";

export class Query {
    constructor(renderer, k) {
        this.el = document.querySelector(k);
        this.value = 0;
        this.count = 0;
        this.time = 0;
        this.ext = renderer.extensions.get("EXT_disjoint_timer_query_webgl2");
        if(!this.ext){
            this.el.innerText = "N/A";
            return;
        }
        this.gl = renderer.getContext();
        this.query = this.gl.createQuery();
        this.waiting = false;
    }

    start() {
        if(!this.gl) return;
        if(!this.waiting) {
        
            this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.query);
        
        }

    }

    end(time) {
        
        if(!this.gl) return;
        if(!this.waiting) {
        
            this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
            this.waiting = true;
        }

        const available = this.gl.getQueryParameter(this.query, this.gl.QUERY_RESULT_AVAILABLE);
        const disjoint = this.gl.getParameter(this.ext.GPU_DISJOINT_EXT);

        if (available && !disjoint) {
            
            let timeElapsed = this.gl.getQueryParameter(this.query, this.gl.QUERY_RESULT);
            this.value += timeElapsed / 1000000;
            this.count++;
        
        }

        if(time - this.time > 2) {
            this.time = time;
            this.el.innerText = (this.value / this.count).toFixed(2);
            this.count = 0;
            this.value = 0;
        }

        if(available || disjoint) {
            this.waiting = false;
        }

    }
}


export class FPS {
    constructor(k, minK, maxK) {
        this.el = document.querySelector(k);
        this.minEl = document.querySelector(minK);
        this.maxEl = document.querySelector(maxK);
        
        this.min = 0;
        this.max = 0;
        this.value = 0;
        this.count = 0;
        this.nextTime = 0;
        this.prevTime = 0;
    }

    update(time) {
        
        if(this.prevTime === 0) this.prevTime = time;

        if(this.nextTime === 0) this.nextTime = time + 2;

        const dt = time - this.prevTime;
        
        this.prevTime = time;

        if(time > this.nextTime) {
            this.nextTime = time + 2;
            const v = parseInt(1 / (this.value / this.count));
            this.el.innerText = v;
            this.minEl.innerText = this.min = this.min === 0 ? v : Math.min(this.min, v);
            this.maxEl.innerText = this.max = this.max === 0 ? v : Math.max(this.max, v);
            const pc = parseInt(100 * MathUtils.inverseLerp(this.min, this.max, v));
            this.el.style.color = `hsl(${pc}deg 100% 60%)`;
            this.count = 0;
            this.value = 0;
        }

        this.value += dt;
        this.count++;

    }
}