#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include  <string.h>
#include <emscripten/emscripten.h>


#define SIZE 1024

typedef struct Vec3 {
    float x;
    float y;
    float z;
} Vec3;

typedef struct Mat4 {
    float te[16];
} Mat4;


typedef struct Object {
    Vec3 origin;
    Vec3 color;
    float scale;
} Object;

int objectCount = 0;

Object objects[SIZE];

Mat4 *matrices = {0};

Vec3 *colors;

Mat4 *cameraMatrix;

typedef struct Sorty {
    unsigned short index, value;
} Sorty;

Sorty sorted[SIZE];

//UTILS

float viewZ(float x, float y, float z) {
    
    float *e = cameraMatrix->te;

    float w = 1. / ( e[ 3 ] * x + e[ 7 ] * y + e[ 11 ] * z + e[ 15 ] );

    return ( e[ 2 ] * x + e[ 6 ] * y + e[ 10 ] * z + e[ 14 ] ) * w;

}

int cmpfunc (const void * a, const void * b) {
   
   return ( ((Sorty*) a )->value - ((Sorty*) b )->value );

}

float distanceToSquared(float x1, float y1, float z1, float x2, float y2, float z2){
    float dx = x1 - x2;
    float dy = y1 - y2;
    float dz = z1 - z2;

    return dx * dx + dy * dy + dz * dz;
    
}


//API

EMSCRIPTEN_KEEPALIVE void init( int count ){
    
    cameraMatrix = (Mat4 *) malloc( sizeof(Mat4) );
    matrices = (Mat4 *) malloc(sizeof(Mat4) * SIZE);
    colors = (Vec3 *) malloc(sizeof(Vec3) * SIZE);

}

EMSCRIPTEN_KEEPALIVE void clear( void ) {

    objectCount = 0;

}

EMSCRIPTEN_KEEPALIVE void spawn(float ox, float oy, float oz, float cx, float cy, float cz, float sc){
    
    Object *ob = objects + objectCount;
    
    ob->origin.x = ox;
    ob->origin.y = oy;
    ob->origin.z = oz;
    ob->color.x = cx;
    ob->color.y = cy;
    ob->color.z = cz;
    ob->scale = sc;

    objectCount++;

}

EMSCRIPTEN_KEEPALIVE int update( void ){
    
    int count = 0;
    
    for(int i=0; i < objectCount; i++) {
        
        Object *o = objects + i;
        
        float z = viewZ( o->origin.x, o->origin.y, o->origin.z );
        
        if( z > 0 ) continue;

        count++;

        sorted[count].index = i;

        sorted[count].value = (unsigned short) (-z);
        
    }

    qsort(sorted, count, sizeof(Sorty), cmpfunc);

    for(int i=0; i < count; i++) {
        
        int index = sorted[i].index;
        
        Object *o = objects + index;
        
        Mat4 *mat = matrices + i;
        float sc = o->scale;
        
        mat->te[0] = sc;
        mat->te[5] = sc;
        mat->te[10] = sc;
        
        mat->te[12] = o->origin.x;
        mat->te[13] = o->origin.y;
        mat->te[14] = o->origin.z;
        mat->te[15] = 1.;

        colors[i] = o->color;
    }

    return count;
}

EMSCRIPTEN_KEEPALIVE void *getInstanceMatrices(void){
    return (void *) matrices;
}

EMSCRIPTEN_KEEPALIVE void *getInstanceColors(void){
    return (void *) colors;
}

EMSCRIPTEN_KEEPALIVE void *getCameraMatrix(void) {
    return (void *) cameraMatrix;
}
