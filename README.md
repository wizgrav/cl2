# Compute-Less Clustered Lighting

A technique for rendering thousands of lights in WebGL. The demo can be tweaked with url params. 
Light count can be tuned with a [size url param (1-32)](). Params [model=0]() and [wisp=0]() hide various meshes. 
Lights are morton ordered by default, [shuffle=1]() disables. Antialiasing can be enabled with a [msaa=1]() param

## Process

The assignment of the lights into clusters is performed entirely in the GPU using the fixed function pipeline. We will use two textures to store the cluster lists.

##### List texture 
The list texture is __RGBA unsigned byte__ type/format. We partition it spatially into XY tiles. Each 2D tile is then subdivided horizontally into Z depth slices / clusters. The above define a block of clusters where each texel contains a batch of 32 lights that belong in each cluster. 

We replicate the above structure vertically to create a vertical list of __(lightCount / 32)__ blocks. The total texture dimensions will be __width = X tiles * Z slices__ and height = Y tiles * N batches/blocks.

We clear all 4 channels to zero and proceed to rasterize all our lights in the list texture with an instanced draw call. Each light is represented as an instance of a quad. 

In the vertex shader we calculate the clip space bounds for each light sphere and apply it to the vertices of a quad. We snap the X clip coordinate to the Z cluster subdivisions to enclose whole tiles. We also scale and translate the Y coordinate to apply the quad on the appropriate batch/block with index __( lightInstanceID / 32 )__. Finally we calculate the min and max z depth slices that this light extends to and pass them as varyings to the fragment shader.

In the fragment shader, we find the depth slice of the current pixel as __( fragCoord.x \% numberOfdepthSlices)__ and if it is outside the min and max range in the varyings we calculated before, we discard it. Otherwise we proceed to set the appropriate bit in the cluster bitmask.

As WebGL doesn't support logical operations to OR the bits directly, we emulate them on top of fixed point by setting the Blend to __( ONE, ONE )__. Each RGBA texel is treated as a sequence of 4 bitmasks of 8 elements each for a total of 32 elements per batch. 

Based on the position of the light in  the batch __( positionInBatch = instanceID \% 32 )__ we calculate a power of two from 0 - 7 __( positionInBatch \% 8 )__ and divide by 255.

We write the result to the rgba channel(0-3) at __( positionInBatch / 8 )__ with the rest of the channels set to zero. The additive blending will then set the bit corresponding to the position of the light in this batch.

##### Master texture
The master texture is __R32UI__. We use integers as 32 elements bitmasks directly here since we don't need blending. The structure for this texture is similar to the list texture. 

We divide spatially into XY tiles and subdivide them horizontally into Z clusters but here we also subdivide the XY tiles vertically as well to add multiple master texels per cluster. 

Every master texel is a bitmask of 32 elements each indicating if a batch of 32 lights had at least one light active in this cluster. 

 Unlike the list texture, we don't partition this texture into vertical blocks. The reason we arrange it like this, with the master masks contained in the XY tile, is to take advantage of caching later when we perform the lighting. 

We draw a fullscreen triangle and do a gather operation for each texel of the master texture, fetching 32 texels for the corresponding XYZ cluster in each of 32 blocks in the list texture and check if even one of the rgba channels is non zero. If true we set the bit for this batch in the master texel. Eventually we end up with an hierarchy of bitmasks contained in the two textures.

##### Shading

When performing the lighting, we figure out the XYZ cluster the fragment belongs to and fetch the corresponding master texel(s). We iterate their bits and for those which are set, we fetch the appropriate list texel from the list texture. We convert each list fixed point rgba texel back to uint and iterate its 32 bits. For the set bits, we calculate the light index __( 32 * batchId + positionInBatch )__ and fetch the light properties to shade it.


## Performance

The assignment of lights in the cluster lists is performed efficiently using the fixed function pipeline. Each light will write just one texel per cluster they belong into without using atomic instructions.

Lights will usually span several Z slices in the same tile. With the chosen arrangment, the same lights in adjacent slices will also be in adjacent texels of the list texture increasing the probability of them being already present in cachelines.

We only use 1 bit per light but always allocate for worst case which sounds excessive but it's still just  around 5\% of the worst case for the standard approach of using variable lists of integer indices. 

The WebGL shading language is based on GLSL ES 3.0 which is rather archaic. On virtually every other platform findLSB/ffs/ctz can and should be utilized to perform the bitmask iteration in order to minimize the instruction cost.

Perhaps the most important optimization we can perform would be to presort the lights by their morton order. This order can be calculated by multiplexing the bits of some of the, world or camera space, coordinates of the lights. 

This operation will rearrange the representative bits of lights which are close in space, to come closer in the bitmasks as well leading to more empty clusters overall with those remaining being fuller, resulting in significantly reduced texel fetching while shading.

In the demo where the lights are orbiting relatively close to an anchor, they are morton ordered just once on scene creation based on the world space XZ coordinates of their anchor.
