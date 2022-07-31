import { resizeCanvasToDisplaySize } from './glUtils';
import './style.css'

const vertexShaderSrc = `
attribute vec2 a_position;
attribute vec2 a_texCoord;

uniform vec2 u_resolution;
uniform float u_flipY;

varying vec2 v_texCoord;

void main() {
   // convert the rectangle from pixels to 0.0 to 1.0
   vec2 zeroToOne = a_position / u_resolution;

   // convert from 0->1 to 0->2
   vec2 zeroToTwo = zeroToOne * 2.0;

   // convert from 0->2 to -1->+1 (clipspace)
   vec2 clipSpace = zeroToTwo - 1.0;

   gl_Position = vec4(clipSpace * vec2(1, u_flipY), 0, 1);

   // pass the texCoord to the fragment shader
   // The GPU will interpolate this value between points.
   v_texCoord = a_texCoord;
}
`;

const fragmentShaderSrc = `
precision mediump float;

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
function setRectangle(gl: WebGLRenderingContext, x: number, y: number, width: number, height: number) {
    const x1 = x;
    const x2 = x + width;
    const y1 = y;
    const y2 = y + height;

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

function createAndSetupTexture(gl: WebGLRenderingContext): WebGLTexture {
    const texture = gl.createTexture();
    if(!texture){
        throw new Error("unable to create webgl texture");
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
 
    // Set up texture so we can render any size image and so we are
    // working with pixels.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
 
    return texture;
}


class PingPongFbos{
    public textures:WebGLTexture[] = [];
    public framebuffers: WebGLFramebuffer[] = [];

    constructor(private _gl:WebGLRenderingContext, private _dimension:{width: number, height: number} ){
        this.init();
    }

    private init(){
        const gl = this._gl;

        for (let ii = 0; ii < 2; ++ii) {
            const texture = createAndSetupTexture(this._gl);
            this.textures.push(texture);

            // make the texture the same size as the image
            gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA, this._dimension.width, this._dimension.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

            // Create a framebuffer
            const fbo = gl.createFramebuffer() as WebGLFramebuffer;
            this.framebuffers.push(fbo);
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

            // Attach a texture to it.
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        }
    }
}

export function render(image: HTMLImageElement){
    const canvas = document.getElementById("canvas") as HTMLCanvasElement;

    const gl: WebGLRenderingContext = canvas.getContext("webgl") as WebGLRenderingContext;

    let program!: WebGLProgram;

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
    const flipYUniformLocation: WebGLUniformLocation = gl.getUniformLocation(program, "u_flipY") as WebGLUniformLocation;
    const resolutionUniformLocation: WebGLUniformLocation = gl.getUniformLocation(program, "u_resolution") as WebGLUniformLocation;
    const fragResolutionUniformLoation: WebGLUniformLocation = gl.getUniformLocation(program, "u_otherResolution") as WebGLUniformLocation;
    const textureSizeUniformLocation: WebGLUniformLocation = gl.getUniformLocation(program, "u_textureSize") as WebGLUniformLocation;
    const directionUniformLocation: WebGLUniformLocation = gl.getUniformLocation(program, "u_direction") as WebGLUniformLocation;


    resizeCanvasToDisplaySize(gl.canvas);
    const width = gl.canvas.width;
    const height = gl.canvas.height;
    console.log("res", width, height);

    // Create a buffer to put three 2d clip space points in
    const positionBuffer = gl.createBuffer() as WebGLBuffer;
    // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    // Set a rectangle the same size as the image.
    setRectangle(gl, 0, 0, image.width, image.height);



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


    // Create a texture.
    const originalImageTexture = createAndSetupTexture(gl);
    // Upload the image into the texture.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    
    const pingPongFbos = new PingPongFbos(gl, {width: image.width, height: image.height });

    {
        // draw
        // Clear the canvas
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        // Tell it to use our program (pair of shaders)
        gl.useProgram(program);

        // Turn on the position attribute
        gl.enableVertexAttribArray(positionAttributeLocation);

        // Bind the position buffer.
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        // Tell the position attribute how to get data out of positionBuffer (ARRAY_BUFFER)
        const size = 2;          // 2 components per iteration
        const type = gl.FLOAT;   // the data is 32bit floats
        const normalize = false; // don't normalize the data
        const stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
        const offset = 0;        // start at the beginning of the buffer
        gl.vertexAttribPointer(positionAttributeLocation, size, type, normalize, stride, offset);

        // Turn on the texcoord attribute
        gl.enableVertexAttribArray(texCoordAttributeLocation);

        // bind the texcoord buffer.
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);

        // Tell the texcoord attribute how to get data out of texcoordBuffer (ARRAY_BUFFER)
        gl.vertexAttribPointer(texCoordAttributeLocation, size, type, normalize, stride, offset);

        // set the size of the image
        gl.uniform2f(textureSizeUniformLocation, image.width, image.height);

        // start with the original image
        gl.bindTexture(gl.TEXTURE_2D, originalImageTexture);

        // don't y flip images while drawing to the textures
        gl.uniform1f(flipYUniformLocation, 1);

        const setFramebuffer = (fbo: WebGLFramebuffer | null, width: number, height: number) => {
            // make this the framebuffer we are rendering to.
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

            // Tell the shader the resolution of the framebuffer.
            gl.uniform2f(fragResolutionUniformLoation, width, height);
            gl.uniform2f(resolutionUniformLocation, width, height);

            // Tell webgl the viewport setting needed for framebuffer.
            gl.viewport(0, 0, width, height);
        }
        
        // increase iterations to increase quality
        const iterations = 8;
        const radius = 10;
        for(let i = 0; i < iterations; i++){
            // draw in firs fbo with direction horizontal
             // Setup to draw into one of the framebuffers.
            setFramebuffer(pingPongFbos.framebuffers[i % 2], image.width, image.height);
            const direction = i % 2 == 0 ? {x: radius, y: 0} : {x: 0, y: radius};
            gl.uniform2f(directionUniformLocation, direction.x, direction.y);

            // Draw the rectangle.
            const primitiveType = gl.TRIANGLES;
            const offset = 0;
            const count = 6;
            gl.drawArrays(primitiveType, offset, count);

            // for the next draw, use the texture we just rendered to.
            gl.bindTexture(gl.TEXTURE_2D, pingPongFbos.textures[i % 2]);
        }

        // finally draw the result to the canvas.
        setFramebuffer(null, gl.canvas.width, gl.canvas.height);
        gl.uniform1f(flipYUniformLocation, -1);  // need to y flip for canvas
        // Draw the rectangle.
        const primitiveType = gl.TRIANGLES;
        const count = 6;
        const direction = {x: 0, y: 0};
        gl.uniform2f(directionUniformLocation, direction.x, direction.y);
        gl.drawArrays(primitiveType, 0, count);
    }
}
