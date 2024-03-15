#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include  <string.h>
#include <emscripten/emscripten.h>

#define max(a,b)             \
({                           \
    __typeof__ (a) _a = (a); \
    __typeof__ (b) _b = (b); \
    _a > _b ? _a : _b;       \
})

#define min(a,b)             \
({                           \
    __typeof__ (a) _a = (a); \
    __typeof__ (b) _b = (b); \
    _a < _b ? _a : _b;       \
})

typedef struct Vec4 {
    float x, y, z, w;
} Vec4;

typedef struct Light {
    Vec4 origin;
    Vec4 color;
    Vec4 meta;
    unsigned int morton;
} Light;

typedef struct LightData {
    Vec4 position;
    Vec4 color;
} LightData;


Light *lights;

LightData *lightTexture;

typedef struct Mat4 {
    float te[16];
} Mat4;

Mat4 *cameraMatrix;

int lightCount;

int maxLightCount;

//UTILS

float worldtoView(float x, float y, float z, float r, Vec4 *target) {
    
    float *e = cameraMatrix->te;

    float w = 1 / ( e[ 3 ] * x + e[ 7 ] * y + e[ 11 ] * z + e[ 15 ] );

    target->x = ( e[ 0 ] * x + e[ 4 ] * y + e[ 8 ] * z + e[ 12 ] ) * w;
    target->y = ( e[ 1 ] * x + e[ 5 ] * y + e[ 9 ] * z + e[ 13 ] ) * w;
    target->z = ( e[ 2 ] * x + e[ 6 ] * y + e[ 10 ] * z + e[ 14 ] ) * w;
    target->w = r;

    return target->z;
}

void hsv2rgb(float h, float s,float v, Vec4 *t ){
    
    float H = fmod(h, 1.) * 360.;
     float C = s*v;
    float X = C*(1.-fabs(fmod(H/60.0, 2.)-1.));
    float m = v-C;
    float r,g,b;
    if(H >= 0 && H < 60){
        r = C,g = X,b = 0;
    }
    else if(H >= 60 && H < 120){
        r = X,g = C,b = 0;
    }
    else if(H >= 120 && H < 180){
        r = 0,g = C,b = X;
    }
    else if(H >= 180 && H < 240){
        r = 0,g = X,b = C;
    }
    else if(H >= 240 && H < 300){
        r = X,g = 0,b = C;
    }
    else{
        r = C,g = 0,b = X;
    }
    t->x = (r+m);
    t->y = (g+m);
    t->z = (b+m);
}

//API

EMSCRIPTEN_KEEPALIVE void init(int count) {
    
    cameraMatrix = (Mat4 *) malloc( sizeof(Mat4) );
    lights = (Light *) malloc( sizeof(Light) * count );
    lightTexture = (LightData *) malloc( sizeof(LightData) * count );
    
    lightCount = 0;

    maxLightCount = count;

}


EMSCRIPTEN_KEEPALIVE int add(float px, float py, float pz, float pw, float r, float g, float b, float a, float speed, float rd) {

    if(lightCount == maxLightCount) return lightCount;

    Light *l = lights + lightCount;

    l->origin.x = px;
    l->origin.y = py;
    l->origin.z = pz;
    l->origin.w = pw;

    hsv2rgb(r, 0.5, 0.66, &l->color);
    l->meta.x = r;
    l->meta.y = speed;
    l->meta.z = rd;

    // Morton encoding
    static const unsigned int B[] = {0x55555555, 0x33333333, 0x0F0F0F0F, 0x00FF00FF};
    static const unsigned int S[] = {1, 2, 4, 8};

    unsigned int x = (unsigned int) ( px );
    unsigned int y = (unsigned int) ( pz );
    
    x = (x | (x << S[3])) & B[3];
    x = (x | (x << S[2])) & B[2];
    x = (x | (x << S[1])) & B[1];
    x = (x | (x << S[0])) & B[0];

    y = (y | (y << S[3])) & B[3];
    y = (y | (y << S[2])) & B[2];
    y = (y | (y << S[1])) & B[1];
    y = (y | (y << S[0])) & B[0];

    l->morton = x | (y << 1);

    return ++lightCount;

}

int cmpfunc (const void * a, const void * b) {
   
   return ( ((Light*) a )->morton - ((Light*) b )->morton );

}

EMSCRIPTEN_KEEPALIVE void sort( void ) {

    qsort(lights, lightCount, sizeof(Light), cmpfunc);

}

EMSCRIPTEN_KEEPALIVE int raw( void ) {

    for (int i = 0;  i < lightCount; i++) {
        
        Light *l = lights + i;
        
        lightTexture[i].position = l->origin;

        lightTexture[i].color = l->meta;
    
    }

    return lightCount;

}

EMSCRIPTEN_KEEPALIVE int update( float time ) {
    
    for (int i = 0;  i < lightCount; i++) {
        
        Light *l = lights + i;
        
        float x = l->origin.x + sin(time * l->meta.y ) * l->meta.z;
        float z = l->origin.z + cos(time * l->meta.y ) * l->meta.z;

        float viewZ = worldtoView( x, l->origin.y, z, l->origin.w, &lightTexture[i].position);

        lightTexture[i].color = l->color;
    
    }

    return lightCount;

}

EMSCRIPTEN_KEEPALIVE void *getCameraMatrix(void) {
    return (void *) cameraMatrix;
}

EMSCRIPTEN_KEEPALIVE void *getLightTexture(void) {
    return (void *) lightTexture;
}
