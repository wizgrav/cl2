#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <string.h>
#include <algorithm>
#include <emscripten/emscripten.h>


#define SIZE 2048

typedef struct Vec4 {
    float x;
    float y;
    float z;
    float w;
} Vec4;

typedef struct Mat4 {
    float te[16];
} Mat4;


int objectCount = 0;

Vec4 *origins;
Vec4 *ocolors;
Vec4 *colors;

Mat4 *cameraMatrix;

typedef struct Sorty {
    unsigned short index, value;
} Sorty;

Sorty sorted[SIZE];

//UTILS


extern "C" {

inline float viewZ(float x, float y, float z) {
    
    float *e = cameraMatrix->te;

    return ( e[ 2 ] * x + e[ 6 ] * y + e[ 10 ] * z + e[ 14 ] );

}

int cmpfunc (const void * a, const void * b) {
   
   return ( ((Sorty*) a )->value - ((Sorty*) b )->value );

}


struct cmpp {
    bool operator() (const Sorty a, const Sorty b) { return a.value < b.value; }
};

//API

EMSCRIPTEN_KEEPALIVE void init( int count ){
    
    cameraMatrix = (Mat4 *) malloc( sizeof(Mat4) );
    origins = (Vec4 *) malloc(sizeof(Vec4) * SIZE);
    ocolors = (Vec4 *) malloc(sizeof(Vec4) * SIZE);
    colors = (Vec4 *) malloc(sizeof(Vec4) * SIZE);

}

EMSCRIPTEN_KEEPALIVE void clear( void ) {

    objectCount = 0;

}

EMSCRIPTEN_KEEPALIVE void spawn(float ox, float oy, float oz, float cx, float cy, float cz, float index){
    
    Vec4 *origin = origins + objectCount;
    
    origin->x = ox;
    origin->y = oy;
    origin->z = oz;

    Vec4 *color = ocolors + objectCount;
    
    color->x = cx;
    color->y = cy;
    color->z = cz;
    color->w = index;

    objectCount++;

}

EMSCRIPTEN_KEEPALIVE int update( void ){
    
    int count = 0;
    
    for(int i=0; i < objectCount; i++) {
        
        Vec4 *o = origins + i;
        
        float z = viewZ( o->x, o->y, o->z );
        
        if( z > 0 ) continue;

        sorted[count].index = i;

        sorted[count].value = (unsigned short) (-z);

        count++;
        
    }

    //qsort(sorted, count, sizeof(Sorty), cmpfunc);
    std::sort(sorted, sorted + count, cmpp{});


    for(int i=0; i < count; i++) colors[i] = ocolors[ sorted[i].index ];

    return count;
}

EMSCRIPTEN_KEEPALIVE void *getInstanceColors(void){
    return (void *) colors;
}

EMSCRIPTEN_KEEPALIVE void *getCameraMatrix(void) {
    return (void *) cameraMatrix;
}

}