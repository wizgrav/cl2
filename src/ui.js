export default function init(params, renderer){
    const msaa = params.get("msaa") || false;
    const root = document.querySelector("#ui");
    const v = parseInt(params.get("size") || 16);
    const cap = renderer.capabilities.maxTextureSize;
    ( cap > 4096 ? (cap > 8192 ? [16, 22, 32, 45] : [16, 22, 32] ) : [16, 22]).forEach((k, i) => {
        const el = document.createElement("button");
        el.innerText = (1 << i) + "K";
        if(v !== k) {
            el.style.cursor = "pointer";
            el.classList.add("disabled")
            el.onclick = () => document.location = "./?size=" + k + ( msaa ? "&msaa=1" : "" );
        }
        root.appendChild(el);
    });

    let el =  document.createElement("button");
    el.innerText = "AA";
    el.style.color = "#330000";
    if(!msaa) el.classList.add("disabled"); 
    el.onclick = () => document.location = "./?size=" + v + ( msaa ? "" : "&msaa=1" );
    el.style.cursor = "pointer";
    root.appendChild(el);

    el =  document.createElement("button");
    el.innerText = "FS";
    el.style.color = "#002200";
    el.classList.add("disabled"); 
    el.onclick = () => document.querySelector("canvas").requestFullscreen();
    el.style.cursor = "pointer";
    root.appendChild(el);

    el =  document.createElement("button");
    el.innerText = "VR";
    el.style.color = "#000033";
    el.classList.add("disabled"); 
    el.onclick = () => document.querySelector("canvas").requestFullscreen();
    el.style.cursor = "pointer";
    root.appendChild(el);

}
