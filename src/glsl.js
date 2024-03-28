import { ShaderChunk, AdditiveBlending, RawShaderMaterial, CustomBlending, OneFactor, ZeroFactor, NoBlending } from "three";

export const lights_physical_pars_fragment = `//glsl

    uniform vec3 vrParams;
    uniform vec4 clusterParams;
    uniform ivec4 sliceParams;
    uniform sampler2D lightTexture;
    uniform sampler2D listTexture;
    uniform usampler2D tileTexture;
    
`;

export const lights_fragment_begin = `//glsl
    
    float ipdFix = gl_FragCoord.x > vrParams.x ? vrParams.y : 0.;
    ivec2 txy = ivec2( floor(gl_FragCoord.xy) * clusterParams.xy );
    int slice = int( log( vViewPosition.z ) * clusterParams.z - clusterParams.w );
    
    txy.x = txy.x * sliceParams.z + slice;
    
    
    for( int i = 0; i < sliceParams.w; i++) {

        uint cv = texelFetch( tileTexture, ivec2( txy.x, txy.y * sliceParams.w + i), 0 ).r;

        int clusterIndex = 32 * i;

        for(; cv != 0u ; ){
            
            if( ( cv & 1u ) == 1u ) {
    
                vec4 texel = texelFetch(listTexture, ivec2(txy.x, txy.y + sliceParams.y * clusterIndex), 0);
            
                int lightIndex = 2 * 32 * clusterIndex;
                
                uvec4 utexel = uvec4(texel * 255.);

                for(int lmax = lightIndex + 2 * 32; lightIndex < lmax; lightIndex += 2 * 8){
                    
                    uint value = utexel.x;

                    utexel.xyzw = utexel.yzwx; // rotate to iterate the rgba components
           
                    for( int j = 0; value != 0u; j += 2, value >>= 1 ) {

                        if ( ( value & 1u ) == 1u ){
               
                            vec4 tx = texelFetch(lightTexture, ivec2(lightIndex + j, 0), 0);
                            
                            tx.x -= ipdFix;
                            
                            vec3 lVector = tx.xyz - geometryPosition;

                            float lightDistance = length( lVector );

                            if( lightDistance < tx.w ) {
                                
                                vec3 color = texelFetch(lightTexture, ivec2(lightIndex + j + 1, 0), 0).rgb;

                                directLight.direction = normalize( lVector );

                                directLight.color = color * getDistanceAttenuation( lightDistance, tx.w, 2. );
                                
                                RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
                            
                            }
                    
                    
                        }

                    }

                    
    
                }
   
       
            }
       
            // In lieu of a ctz/ffs instruction we conditionally skip bits with a fixed step 
            int inc = (cv & 30u) != 0u ? 1 : 5;
            cv >>= inc;
            clusterIndex += inc;
        }
    }

`;

// Calculate light positions with GPGPU
export function getMotionMaterial() {
    return new RawShaderMaterial({
        depthTest: false,
        depthWrite: false,
        blending: NoBlending,
        premultipliedAlpha: true,
        uniforms: {
            time: null,
            origTexture: null,
            viewMatrix: { value: null }
        },
        glslVersion:"300 es",
        vertexShader: `//glsl

            precision highp float;
            
            in vec3 position;

            void main() {

                gl_Position = vec4(position.xyz, 1.);

            }

        `,

        fragmentShader: `//glsl
            precision highp float;
            precision highp int;
            
            uniform sampler2D origTexture;
            uniform mat4 viewMatrix;
            uniform float time;

            layout(location = 0) out vec4 light;

            vec3 hsv2rgb(vec3 c) {
            
                vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
                vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
                return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
            
            }

            void main() {
                
                int x = int( gl_FragCoord.x );
                bool isColor = (x & 1) == 1;
                
                vec4 tx = texelFetch(origTexture, ivec2(x, 0), 0);
                
                if(isColor) {

                    light.rgb = hsv2rgb(vec3(tx.r, 0.5, 0.66));
                    light.a = 1.;

                } else {

                    vec4 ptx = texelFetch(origTexture, ivec2(x + 1, 0), 0);
                    light = viewMatrix * vec4(  tx.x + sin( time * ptx.y) * ptx.z, tx.y, tx.z + cos(time * ptx.y) * ptx.z, 1. );
                    light.w = tx.w;
                    
                }
            
            }
        
        `
    })

}

export function getListMaterial() {
    return new RawShaderMaterial({
        depthTest: false,
        depthWrite: false,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneFactor,
        blendSrcAlpha: OneFactor,
        blendDstAlpha: OneFactor,
        premultipliedAlpha: true,
        uniforms: {
            vrParams: null,
            sliceParams: null,
            clusterParams: null,
            batchCount: null,
            lightTexture: null,
            projectionMatrix: { value: null }
        },
        glslVersion: "300 es",
        vertexShader: `//glsl
            precision highp float;
            precision highp int;
            precision highp sampler2D;
            
            in vec3 position;

            uniform vec4 vrParams;

            uniform ivec4 sliceParams;

            uniform vec4 clusterParams;

            uniform float batchCount;

            uniform float zNear;

            uniform mat4 projectionMatrix;

            uniform highp sampler2D lightTexture;
            
            flat out ivec2 vClusters;

            flat out int vID;


            vec4 projectSphereView(vec3 c, float r)
            {   
                c.z = -c.z;
                if (c.z < r) return (abs(c.x) < r || abs(c.y) < r)  ? vec4(-1., -1, 1., 1.) : vec4(-10.);
                //if (c.z < r) return vec4(-10.);
                
                float P00 = projectionMatrix[0][0];
                float P11 = projectionMatrix[1][1];

                vec3 cr = c * r;
                float czr2 = c.z * c.z - r * r;

                float vx = sqrt(c.x * c.x + czr2);
                float minx = (vx * c.x - cr.z) / (vx * c.z + cr.x);
                float maxx = (vx * c.x + cr.z) / (vx * c.z - cr.x);

                float vy = sqrt(c.y * c.y + czr2);
                float miny = (vy * c.y - cr.z) / (vy * c.z + cr.y);
                float maxy = (vy * c.y + cr.z) / (vy * c.z - cr.y);

                return vec4(minx * P00, miny * P11, maxx * P00, maxy * P11);
            }

            /*
            float square(float v) { return v * v; }

            void getBoundsForAxis ( vec3 a, vec3 C, float r,  out vec3 L, out vec3 U) {
                vec2 c = vec2(dot(a, C), C.z);
                vec2 bounds[2];
                float tSquared = dot(c, c) - r * r;
                bool cameraInsideSphere = (tSquared <= 0.);
                vec2 v = cameraInsideSphere ? vec2(0.0, 0.0) : vec2(sqrt(tSquared), r) / length(c);
                bool clipSphere = (c.y + r >= nearZ);
                float k = sqrt(square(r) - square(nearZ - c.y));
                for (int i = 0; i < 2; ++i) {
                    if (! cameraInsideSphere) bounds[i] = mat2(v.x, -v.y, v.y, v.x) * c * v.x;
                    bool clipBound = cameraInsideSphere || (bounds[i].y > nearZ);
                    if (clipSphere && clipBound) bounds[i] = vec2(c.x + k, nearZ);
                    v.y = -v.y; k = -k;
                }
                L = bounds[1].x * a; L.z = bounds[1].y;
                U = bounds[0].x * a; U.z = bounds[0].y;
            }

            */
            void main() {

                vec4 offset = texelFetch( lightTexture, ivec2(2 * gl_InstanceID, 0), 0);

                float radius = offset.w;

                if(offset.z > radius) {
                    
                    gl_Position = vec4(10., 10., 0., 1.);

                    return;
                
                }

                vClusters.x = int( log( -offset.z - radius ) * clusterParams.z - clusterParams.w );

                vClusters.y = int( log( -offset.z + radius ) * clusterParams.z - clusterParams.w );

                vID = gl_InstanceID;
                
                // Calculate light extents
                /*
                vec4 ver = projectionMatrix * vec4(offset.xyz + vec3(0., radius * sign(position.y) , 0.), 1. );
                vec4 hor = projectionMatrix * vec4(offset.xyz + vec3(radius * sign(position.x) , 0., 0.), 1. );
                
                float px = 0.5 * ( hor.x / (hor.w + 0.0000001f) + 1.);
                float py = 0.5 * ( ver.y / (ver.w + 0.0000001f) + 1.);
                */
                
                
                vec4 aabb = projectSphereView(offset.xyz, offset.w);

                float px = position.x < 0. ? aabb.x : aabb.z;
                float py = position.y < 0. ? aabb.y : aabb.w;
                
                //getBoundsForAxis( vec3(0, 1, 0), offset.xyz, offset.w,  out vec3 L, out vec3 U)
                px = 0.5 * (  px + 1.);
                py = 0.5 * (  py + 1.);
                
                float sx = float(sliceParams.x);
                float sy = float(sliceParams.y);
                
                // Snap to tile
                px = sign(position.x) > 0. ?  ceil(sx * px) / sx: floor(sx * px) / sx;
                py = sign(position.y) > 0. ?  ceil(sy * py) / sy: floor(sy * py) / sy;
                
                // Scale and translate based on id to the appropriate block/batch of lights
                py = max( 0., min( 1., py));
                py = ( float(vID / 32)  +  py ) / batchCount;
                
                // Back to clip
                px = 2. * px - 1.;
                py = 2. * py - 1.;

                gl_Position = vec4( px, py, 0., 1. );
            
            }

        `,

        fragmentShader: `//glsl
            precision highp float;
            precision highp int;
            
            uniform ivec4 sliceParams;

            flat in ivec2 vClusters;

            flat in int vID;
            
            layout(location = 0) out highp vec4 subtile;

            void main() {
                
                int x = int( gl_FragCoord.x ) % sliceParams.z;

                if( x < vClusters.x || x > vClusters.y) discard;
                
                int id = vID & 31;

                // Calculate the bit and set it to the appropriate rgba component
                float v = float( 1 << (id & 7)) / 255.;

                subtile = id > 15 ? ( id > 23 ? vec4( 0., 0., 0., v ) : vec4( 0., 0., v, 0. ) ) : ( id < 8 ? vec4( v, 0., 0., 0. ) : vec4( 0., v, 0., 0. ) );
            }
        
        `
    })

}


export function getTileMaterial() {

    return new RawShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: {
            batchCount: null,
            sliceParams: null,
            listTexture: null,
        },
        glslVersion:"300 es",
        vertexShader: `//glsl
            precision highp float;
            precision highp int;
            
            in vec3 position;

            void main() {

                gl_Position = vec4(position.xyz, 1.);

            }

        `,

        fragmentShader: `//glsl
            precision highp float;
            precision highp int;
            precision highp sampler2D;
            
            uniform int batchCount;
            uniform ivec4 sliceParams;

            uniform sampler2D listTexture;

            layout(location = 0) out highp uint cluster;

            void main() {

                int x = int( gl_FragCoord.x );
                int y = int( gl_FragCoord.y );
                
                int mc = y % sliceParams.w;
                
                y /= sliceParams.w;

                int ts = 32 * mc;
                int te = min(ts + 32, batchCount);

                cluster = 0u;

                // Check if a batch of 32 has at least one light and toggle the appropriate bit on the master set
                for(; ts < te; ts++) {
                
                    if( texelFetch( listTexture, ivec2(x, y + ts * sliceParams.y), 0 ) != vec4(0.) ) cluster |= 1u << (ts & 31);
                
                }

            }
        
        `
    })

}
