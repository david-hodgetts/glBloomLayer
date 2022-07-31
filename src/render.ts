import { resizeCanvasToDisplaySize } from './glUtils';
import './style.css'

const vertexShaderSrc = `
// an attribute will receive data from a buffer
attribute vec2 a_position;
uniform vec2 u_resolution;

attribute vec2 a_texCoord;
// WebGL will interpolate the values we provide in the vertex shader as it draws each pixel using the fragment shader.
// hence varying name
varying vec2 v_texCoord; 

// all shaders have a main function
void main() {

    // convert the position from pixels to 0.0 to 1.0
    vec2 zeroToOne = a_position / u_resolution;
 
    // convert from 0->1 to 0->2
    vec2 zeroToTwo = zeroToOne * 2.0;
 
    // convert from 0->2 to -1->+1 (clip space)
    vec2 clipSpace = zeroToTwo - 1.0;

    v_texCoord = a_texCoord;
 
    // gl_Position is a special variable a vertex shader
    // is responsible for setting
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
}
`;

const fragmentShaderSrc = `
// precision mediump float;
precision highp float;

// our texture
uniform sampler2D u_image;
uniform vec2 u_textureSize;
uniform vec2 u_otherResolution;
uniform vec2 u_direction;


// the texCoords passed in from the vertex shader.
varying vec2 v_texCoord;

vec4 blur9(sampler2D image, vec2 uv, vec2 resolution, vec2 direction) {
    vec4 color = vec4(0.0);
    vec2 off1 = vec2(1.3846153846) * direction;
    vec2 off2 = vec2(3.2307692308) * direction;
    color += texture2D(image, uv) * 0.2270270270;
    color += texture2D(image, uv + (off1 / resolution)) * 0.3162162162;
    color += texture2D(image, uv - (off1 / resolution)) * 0.3162162162;
    color += texture2D(image, uv + (off2 / resolution)) * 0.0702702703;
    color += texture2D(image, uv - (off2 / resolution)) * 0.0702702703;
    return color;
}

void main() {
//    vec2 onePixel = vec2(1.0, 1.0) / u_textureSize;
    vec2 uv = vec2(gl_FragCoord.xy / u_otherResolution);
    // flip
    uv.y = 1.0 - uv.y;
    gl_FragColor = blur9(u_image, uv, u_otherResolution, u_direction);
}
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader  {
    const shader = gl.createShader(type) as WebGLShader;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (success) {
        return shader;
    }

    const err = gl.getShaderInfoLog(shader) ?? undefined;
    console.error(err);
    gl.deleteShader(shader);
    throw new Error(err);
}

function createProgram(gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
    const program = gl.createProgram() as WebGLProgram;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (success) {
        return program;
    }

    const err = gl.getProgramInfoLog(program) as string;

    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    throw new Error(err);
}

// Fills the buffer with the values that define a rectangle.
function setRectangle(gl:WebGLRenderingContext, x: number, y: number, width: number, height: number) {
  var x1 = x;
  var x2 = x + width;
  var y1 = y;
  var y2 = y + height;
 
  // NOTE: gl.bufferData(gl.ARRAY_BUFFER, ...) will affect
  // whatever buffer is bound to the `ARRAY_BUFFER` bind point
  // but so far we only have one buffer. If we had more than one
  // buffer we'd want to bind that buffer to `ARRAY_BUFFER` first.
 
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
     x1, y1,
     x2, y1,
     x1, y2,
     x1, y2,
     x2, y1,
     x2, y2]), gl.STATIC_DRAW);
}

function computeKernelWeight(kernel:number[]): number {
    const weight = kernel.reduce(function(prev, curr) {
       return prev + curr;
    });
    return weight <= 0 ? 1 : weight;
}

export function render(image: HTMLImageElement){
    const canvas = document.getElementById("canvas") as HTMLCanvasElement;

    const gl: WebGLRenderingContext = canvas.getContext("webgl") as WebGLRenderingContext;

    let program!: WebGLProgram;
    // let positionAttributeLocation!: number;
    // let texCoordAttributeLocation: number;
    // let resolutionUniformLocation!: WebGLUniformLocation;
    // let colorUniformLocation!: WebGLUniformLocation;
    // let positionBuffer!: WebGLBuffer;

    try{
        const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSrc);
        const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSrc);
        program = createProgram(gl, vertexShader, fragmentShader) as WebGLProgram;
    }catch(e){
        console.error(`app halted on error ${e}`);
    }

        
    // Looking up attribute locations (and uniform locations) is something you should do 
    // during initialization, not in your render loop.
    const positionAttributeLocation: number = gl.getAttribLocation(program, "a_position");
    const texCoordAttributeLocation: number = gl.getAttribLocation(program, "a_texCoord");
    const resolutionUniformLocation: WebGLUniformLocation = gl.getUniformLocation(program, "u_resolution") as WebGLUniformLocation;
    const fragResolutionUniformLoation: WebGLUniformLocation = gl.getUniformLocation(program, "u_otherResolution") as WebGLUniformLocation;
    const textureSizeUniformLocation: WebGLUniformLocation = gl.getUniformLocation(program, "u_textureSize") as WebGLUniformLocation;
    const directionUniformLocation: WebGLUniformLocation = gl.getUniformLocation(program, "u_direction") as WebGLUniformLocation;
    // const kernelLocation: WebGLUniformLocation = gl.getUniformLocation(program, "u_kernel[0]") as WebGLUniformLocation;
    // const kernelWeightLocation: WebGLUniformLocation = gl.getUniformLocation(program, "u_kernelWeight") as WebGLUniformLocation;
    // const colorUniformLocation: WebGLUniformLocation = gl.getUniformLocation(program, "u_color") as WebGLUniformLocation;


    // provide texture coordinates for the rectangle.
    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0.0, 0.0,
        1.0, 0.0,
        0.0, 1.0,
        0.0, 1.0,
        1.0, 0.0,
        1.0, 1.0]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(texCoordAttributeLocation);
    gl.vertexAttribPointer(texCoordAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    // Create a texture.
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Set the parameters so we can render any size image.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // Upload the image into the texture.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);


    // set kernel
    // const blurKernel = [
    //     1,  0, -1,
    //     2,  0, -2,
    //     1,  0, -1
    // ];


    // Attributes get their data from buffers so we need to create a buffer
    const positionBuffer = gl.createBuffer() as WebGLBuffer;
    // WebGL lets us manipulate many WebGL resources on global bind points. 
    // You can think of bind points as internal global variables inside WebGL. 
    // First you bind a resource to a bind point. Then, all other functions refer to the resource through the bind point. 
    // So, let's bind the position buffer.
    
    resizeCanvasToDisplaySize(gl.canvas);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    // Now we can put data in that buffer by referencing it through the bind point
    // three 2d points (in clip space)
    const width = gl.canvas.width;
    const height = gl.canvas.height;
    console.log("res", width, height);
    const positions = [
        0, 0,
        width, 0,
        0, height,
        0, height,
        width, 0,
        width, height,
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);



    // We need to tell WebGL how to convert from the clip space values we'll be setting gl_Position to back into pixels, 
    // often called screen space. To do this we call gl.viewport and pass it the current size of the canvas.
    gl.viewport(0, 0, width, width);

    // Clear the canvas
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Tell it to use our program (pair of shaders)
    gl.useProgram(program);
    // Next we need to tell WebGL how to take data from the buffer we setup above and supply it to 
    // the attribute in the shader. First off we need to turn the attribute on
        
    // set the resolution
    gl.uniform2f(resolutionUniformLocation, gl.canvas.width, gl.canvas.height);
    gl.uniform2f(fragResolutionUniformLoation, gl.canvas.width, gl.canvas.height);
    // gl.uniform4f(colorUniformLocation, 1, 0.5, 0, 1);

    gl.enableVertexAttribArray(positionAttributeLocation);
    
    // Bind the position buffer.
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    // Tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER)
    {
        const size = 2;          // 2 components per iteration
        const type = gl.FLOAT;   // the data is 32bit floats
        const normalize = false; // don't normalize the data
        const stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
        const offset = 0;        // start at the beginning of the buffer
        gl.vertexAttribPointer(positionAttributeLocation, size, type, normalize, stride, offset)
    }

    gl.uniform2f(textureSizeUniformLocation, image.width, image.height);
    const direction = {
        x: 1,
        y: 0,
    }
    gl.uniform2f(directionUniformLocation, direction.x, direction.y);

    // gl.uniform1fv(kernelLocation, blurKernel);
    // gl.uniform1f(kernelWeightLocation, computeKernelWeight(blurKernel));

    // A hidden part of gl.vertexAttribPointer is that it binds the current ARRAY_BUFFER to the attribute. 
    // In other words now this attribute is bound to positionBuffer. 
    // That means we're free to bind something else to the ARRAY_BUFFER bind point. 
    // The attribute will continue to use positionBuffer.

    const primitiveType = gl.TRIANGLES;
    const offset = 0;
    const count = 6;
    gl.drawArrays(primitiveType, offset, count);

    // If you want 3D it's up to you to supply shaders that convert from 3D to clip space 
    // because WebGL is only a rasterization API.
}
