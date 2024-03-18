import { ShaderChunk, AdditiveBlending, RawShaderMaterial, CustomBlending, OneFactor, ZeroFactor, NoBlending } from "three";

ShaderChunk['lights_physical_pars_fragment'] += `//glsl

    uniform vec4 clusterParams;
    uniform int subtileWidth;
    uniform int subtileHeight;
    uniform int masterCount;
    uniform sampler2D lightTexture;
    uniform sampler2D listTexture;
    uniform usampler2D tileTexture;
    
`;

ShaderChunk['lights_fragment_begin'] += `//glsl
    
    ivec2 txy = ivec2( gl_FragCoord.xy * clusterParams.xy );

    int clusterId = int( log( vViewPosition.z ) * clusterParams.z - clusterParams.w );

    for( int i = 0; i < masterCount; i++) {

        uint cv = texelFetch( tileTexture, ivec2( txy.x * subtileHeight + clusterId, txy.y * masterCount + i), 0 ).r;

        ivec2 tileCoords = ivec2( txy.x * subtileWidth, txy.y * subtileHeight ) ;
        
        int clusterIndex =  32 * i; 
    
        for(; cv != 0u ; ){
            
            if( ( cv & 1u ) == 1u ) {
    
                vec4 texel = texelFetch(listTexture, tileCoords + ivec2( clusterIndex, clusterId ), 0);
            
                int lightIndex = 2 * 32 * clusterIndex;
                
                for(int lmax = lightIndex + 2 * 32; lightIndex < lmax; lightIndex += 2 * 8){
                    
                    uint value = uint(texel.x * 255.);

                    texel.xyzw = texel.yzwx; // rotate to iterate the rgba components
           
                    for( int j = 0; value != 0u; j += 2, value >>= 1 ) {

                        if ( ( value & 1u ) == 1u ){
               
                            vec4 tx = texelFetch(lightTexture, ivec2(lightIndex + j, 0), 0);

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
            tileParams: null,
            clusterParams: null,
            subtileWidth: null,
            subtileHeight: null,
            lightTexture: null,
            projectionMatrix: { value: null }
        },
        glslVersion: "300 es",
        vertexShader: `//glsl
            precision highp float;
            precision highp int;
            precision highp sampler2D;
            
            in vec3 position;

            uniform vec4 tileParams;

            uniform vec4 clusterParams;

            uniform int subtileWidth;

            uniform int subtileHeight;

            uniform mat4 projectionMatrix;

            uniform highp sampler2D lightTexture;
            
            flat out ivec2 vClusters;

            flat out int vID;

            void main() {

                vec4 offset = texelFetch( lightTexture, ivec2(2 * gl_InstanceID, 0), 0);

                float fw = float( subtileHeight );

                float radius = offset.w;

                if(offset.z > radius) {
                    
                    gl_Position = vec4(2., 2., 0., 1.);

                    return;
                
                }

                vClusters.x = int( log( -offset.z - radius ) * clusterParams.z - clusterParams.w );

                vClusters.y = int( log( -offset.z + radius ) * clusterParams.z - clusterParams.w );

                vID = gl_InstanceID;
                
                // Calculate light extents
                vec4 ver = projectionMatrix * vec4(offset.xyz + vec3(0., radius * sign(position.y) , 0.), 1. );
                vec4 hor = projectionMatrix * vec4(offset.xyz + vec3(radius * sign(position.x) , 0., 0.), 1. );
                
                float px = hor.x / hor.w;
                float py = ver.y / ver.w;

                float sx = tileParams.x / 2.;
                float sy = tileParams.y / 2.;

                // Snap to tile
                px = sign(position.x) > 0. ?  ceil(sx * px) / sx: floor(sx * px) / sx;
                py = sign(position.y) > 0. ?  ceil(sy * py) / sy: floor(sy * py) / sy;
                

                gl_Position = vec4( px, py, 0., 1. );
            
            }

        `,

        fragmentShader: `//glsl
            precision highp float;
            precision highp int;
            
            uniform int subtileWidth;
            uniform int subtileHeight;

            flat in ivec2 vClusters;

            flat in int vID;
            
            layout(location = 0) out vec4 subtile;

            void main() {
                
                int x = int( gl_FragCoord.x ) % subtileWidth;
                int y = int( gl_FragCoord.y ) % subtileHeight;

                if(x != (vID / 32) || y < vClusters.x || y > vClusters.y) discard;
                
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
            subtileWidth: null,
            subtileHeight: null,
            masterCount: null,
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
            
            uniform int subtileWidth;
            uniform int subtileHeight;
            uniform int masterCount;

            uniform sampler2D listTexture;

            layout(location = 0) out highp uint cluster;

            void main() {

                int x = int( gl_FragCoord.x );
                int y = int( gl_FragCoord.y );
                int dx = x % subtileHeight;
                int dy = y % masterCount;
                int tx = subtileWidth * ( x / subtileHeight );
                int ty = ( y / masterCount ) * subtileHeight +  dx;
                int ts = 32 * dy;
                int tmax = min(ts + 32, subtileWidth);
                cluster = 0u;

                // Check if a batch of 32 has at least one light and toggle the appropriate bit on the master set
                for(; ts < tmax; ts++) {
                
                    if( texelFetch( listTexture, ivec2(tx + ts, ty), 0 ) != vec4(0.) ) cluster |= 1u << (ts & 31);
                
                }

            }
        
        `
    })

}
