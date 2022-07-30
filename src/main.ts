
import { render } from './render';

async function main(){
    const ctx = (document.getElementById('2d_canvas') as HTMLCanvasElement).getContext("2d") as CanvasRenderingContext2D;
    {
        ctx.fillStyle = "orange";
        const w = ctx.canvas.width;
        const h = ctx.canvas.height;

        ctx.translate(w / 2, h / 2);
        ctx.fillRect(-20, -20, 40, 40);

    }


    render(ctx.canvas as any);

    // const image = new Image();
    // image.src = "/cat.png";
    // image.onload = () => {
    //     console.log("image loaded");
    //     render(image);
    // }
}


main();