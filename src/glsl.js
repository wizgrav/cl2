import { ShaderChunk, AdditiveBlending, RawShaderMaterial, CustomBlending, OneFactor, ZeroFactor, NoBlending } from "three";

export const lights_physical_pars_fragment = `//glsl

    uniform vec4 clusterParams;
    uniform ivec4 sliceParams;
    uniform sampler2D lightTexture;
    uniform sampler2D listTexture;
    uniform usampler2D masterTexture;
    
`;

export const lights_fragment_begin = `//glsl
    
    ivec2 txy = ivec2( floor(gl_FragCoord.xy) * clusterParams.xy );
    int slice = int( log( vViewPosition.z ) * clusterParams.z - clusterParams.w );
    
    txy.x = txy.x * sliceParams.z + slice;
    
    
    for( int i = 0; i < sliceParams.w; i++) {

        uint master = texelFetch( masterTexture, ivec2( txy.x, txy.y * sliceParams.w + i), 0 ).r;

        int clusterIndex = 32 * i;

        for(; master != 0u ; ){
            
            if( ( master & 1u ) == 1u ) {
    
                vec4 texel = texelFetch(listTexture, ivec2(txy.x, txy.y + sliceParams.y * clusterIndex), 0);
            
                int lightIndex = 2 * 32 * clusterIndex;
                
                uvec4 utexel = uvec4(texel * 255.);

                for(int lmax = lightIndex + 2 * 32; lightIndex < lmax; lightIndex += 2 * 8){
                    
                    uint value = utexel.x;

                    utexel.xyzw = utexel.yzwx; // rotate to iterate the rgba components
           
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
            int inc = (master & 30u) != 0u ? 1 : 5;
            master >>= inc;
            clusterIndex += inc;
        }
    }

`;

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
            nearZ: null,
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

            uniform ivec4 sliceParams;

            uniform vec4 clusterParams;

            uniform float batchCount;

            uniform float nearZ;

            uniform mat4 projectionMatrix;

            uniform highp sampler2D lightTexture;
            
            flat out ivec2 vClusters;

            flat out int vID;

            float square(float v) { return v * v;}
           
            vec2 project_sphere_flat(float view_xy, float view_z, float radius)
            {
                float len = length(vec2(view_xy, view_z));
                float sin_xy = radius / len;
            
                vec2 result;
            
                if (sin_xy < 0.999)
                {
                    float cos_xy = sqrt(1.0 - sin_xy * sin_xy);
                    
                    // Rotate both ways on the half-angles.
                    vec2 rot_lo = mat2(cos_xy, sin_xy, -sin_xy, cos_xy) * vec2(view_xy, view_z);
                    vec2 rot_hi = mat2(cos_xy, -sin_xy, +sin_xy, cos_xy) * vec2(view_xy, view_z);
            
                    // If we clip beyond near-plane, the range extends infinitely.
                    if (rot_lo.y <= nearZ)
                        rot_lo = vec2(-1.0, 1.0);
                    if (rot_hi.y <= nearZ)
                        rot_hi = vec2(1.0, 1.0);
            
                    // Project result.
                    result = vec2(rot_lo.x / rot_lo.y, rot_hi.x / rot_hi.y);
                }
                else
                {
                    // We're inside the sphere, so range is infinite in both directions.
                    result = vec2(-1.0, 1.0);
                }
            
                return result;
            }
            
           
            void main() {

                vec4 view = texelFetch( lightTexture, ivec2(2 * gl_InstanceID, 0), 0);

                vID = gl_InstanceID;
                 
                float radius = view.w;

                if(view.z > radius - nearZ) {
                    
                    gl_Position = vec4(10., 10., 0., 1.);

                    return;
                
                }

                view.z = -view.z;

                float P00 = projectionMatrix[0][0];
                float P11 = projectionMatrix[1][1];

                vec2 hor = project_sphere_flat(view.x, view.z, view.w) * P00;
                vec2 ver = project_sphere_flat(view.y, view.z, view.w) * P11;
                
                if(hor.x > 1. || hor.y < -1. || ver.x > 1. || ver.y < -1.) {
                    
                    gl_Position = vec4(10., 10., 0., 1.);

                    return;
                
                }

                vClusters.x = int( log( view.z - radius ) * clusterParams.z - clusterParams.w );

                vClusters.y = int( log( view.z + radius ) * clusterParams.z - clusterParams.w );

                
                float px = position.x < 0. ? hor.x : hor.y;
                float py = position.y < 0. ? ver.x : ver.y;
                
                
                px = 0.5 * (  px + 1.);
                py = 0.5 * (  py + 1.);
                
                float sx = float(sliceParams.x);
                float sy = float(sliceParams.y);

                // Snap to tile
                px = position.x < 0. ?  floor(sx * px) / sx : ceil(sx * px) / sx;
                py = position.y < 0. ?  floor(sy * py) / sy : ceil(sy * py) / sy;
                
               
                
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
                
                int z = int( gl_FragCoord.x ) % sliceParams.z;

                if( z < vClusters.x || z > vClusters.y) discard;
                
                int id = vID & 31;

                // Calculate the bit and set it to the appropriate rgba component
                float v = float( 1 << (id & 7)) / 255.;

                subtile = id > 15 ? ( id > 23 ? vec4( 0., 0., 0., v ) : vec4( 0., 0., v, 0. ) ) : ( id < 8 ? vec4( v, 0., 0., 0. ) : vec4( 0., v, 0., 0. ) );
            }
        
        `
    })

}


export function getMasterMaterial() {

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
