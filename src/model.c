#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include  <string.h>
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


typedef struct Object {
    Vec4 origin;
    Vec4 color;
} Object;

int objectCount = 0;

Object objects[SIZE];

Vec4 *colors;

Mat4 *cameraMatrix;

typedef struct Sorty {
    unsigned short index, value;
} Sorty;

Sorty sorted[SIZE];

//UTILS

inline float viewZ(float x, float y, float z) {
    
    float *e = cameraMatrix->te;

    return ( e[ 2 ] * x + e[ 6 ] * y + e[ 10 ] * z + e[ 14 ] );

}

int cmpfunc (const void * a, const void * b) {
   
   return ( ((Sorty*) a )->value - ((Sorty*) b )->value );

}


//API

EMSCRIPTEN_KEEPALIVE void init( int count ){
    
    cameraMatrix = (Mat4 *) malloc( sizeof(Mat4) );
    colors = (Vec4 *) malloc(sizeof(Vec4) * SIZE);

}

EMSCRIPTEN_KEEPALIVE void clear( void ) {

    objectCount = 0;

}

EMSCRIPTEN_KEEPALIVE void spawn(float ox, float oy, float oz, float cx, float cy, float cz, float index){
    
    Object *ob = objects + objectCount;
    
    ob->origin.x = ox;
    ob->origin.y = oy;
    ob->origin.z = oz;

    ob->color.x = cx;
    ob->color.y = cy;
    ob->color.z = cz;
    ob->color.w = index;

    objectCount++;

}

EMSCRIPTEN_KEEPALIVE int update( void ){
    
    int count = 0;
    
    for(int i=0; i < objectCount; i++) {
        
        Object *o = objects + i;
        
        float z = viewZ( o->origin.x, o->origin.y, o->origin.z );
        
        if( z > 0 ) continue;

        sorted[count].index = i;

        sorted[count].value = (unsigned short) (-z);

        count++;
        
    }

    qsort(sorted, count, sizeof(Sorty), cmpfunc);

    for(int i=0; i < count; i++) colors[i] = objects[ sorted[i].index ].color;

    return count;
}

EMSCRIPTEN_KEEPALIVE void *getInstanceColors(void){
    return (void *) colors;
}

EMSCRIPTEN_KEEPALIVE void *getCameraMatrix(void) {
    return (void *) cameraMatrix;
}
