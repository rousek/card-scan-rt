let streaming = true;
let utils, linesMat;
const DEG_90 = Math.PI/2;
const DEG = Math.PI / 180;
const DEG_10 = 10 * DEG;

function toggle() {
    streaming = !streaming;
    if (streaming) {
        document.querySelector('.video-container').style.display = 'block';
        document.querySelector('#cardOutput').style.display = 'none';
        requestAnimationFrame(onLoad);
    } else {
        document.querySelector('.video-container').style.display = 'none';
        document.querySelector('#cardOutput').style.display = 'block';
    }
}

function onOpenCvLoad() {
    utils = new Utils('errorOutput');

    if (cv.getBuildInformation)
    {
        console.log('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
        console.log(cv.getBuildInformation());
        utils.startCamera('vga', onLoad, 'videoInput');
    }
    else
    {
        console.log('aaaaaaaaaaaaaaaaaaaaaa');
        cv['onRuntimeInitialized']=()=>{
            console.log(cv.getBuildInformation());
            utils.startCamera('fullHd', onLoad, 'videoInput');
        }
    }
}

function drawRect(ctx, rect) {
    ctx.beginPath();
    ctx.strokeStyle = "#FF0000";
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.stroke();
}

function onLoad() {
    let errorOutput = document.getElementById('errorOutput');
    let video = document.getElementById('videoInput');
    let target = document.getElementById('target');
    video.width = video.videoWidth;
    video.height = video.videoHeight;

    const cardRatio = 85.60 / 53.98;
    const videoRatio = video.width / video.height;

    const minDim = Math.min(video.width, video.height);
    const defaultMargin = 0.15 * minDim;
    let width, height, marginLeft, marginTop;

    if (videoRatio > cardRatio) {
        marginTop = defaultMargin;
        height = video.height - 2 * marginTop;
        width = height * cardRatio;
        marginLeft = (video.width - width) / 2;
    } else {
        marginLeft = defaultMargin;
        width = video.width - 2 * marginLeft;
        height = width / cardRatio;
        marginTop = (video.height - height) / 2;
    }

    target.style.left = marginLeft + 'px';
    target.style.top = marginTop + 'px';
    target.style.width = width + 'px';
    target.style.height = height + 'px';

    let innerOverlap = 0.5;
    let size = defaultMargin;
    let cornerMargin = size * innerOverlap;


    linesMat = new cv.Mat();
    let src = new cv.Mat(video.height, video.width, cv.CV_8UC4);
    let cap = new cv.VideoCapture(video);
    //let canvas = document.querySelector('#canvasOutput');
    //let ctx = canvas.getContext('2d');
    let card = new cv.Mat(height, width, cv.CV_8UC4);

    let edgeMat = {
        horizontal: new cv.Mat(),
        vertical: new cv.Mat(),
        horizontalGray: new cv.Mat(),
        verticalGray: new cv.Mat()
    };

    let edgeRect = {
        top: new cv.Rect(marginLeft + cornerMargin, marginTop - (1-innerOverlap) * size, width - 2 * cornerMargin, size),
        left: new cv.Rect(marginLeft - (1-innerOverlap) * size, marginTop + cornerMargin, size, height - 2 * cornerMargin),
        right: new cv.Rect(marginLeft + width - innerOverlap * size, marginTop + cornerMargin, size, height - 2 * cornerMargin),
        bottom: new cv.Rect(marginLeft + cornerMargin, marginTop + height - innerOverlap * size, width - 2 * cornerMargin, size)
    }

    const scoreFunc = (pt3, pt4) => 
        (pt1, pt2) => {
            let angle = angleBetweenLineSegs(pt1, pt2, pt3, pt4) + 1;
            //if (angle - 1 > DEG_10 * 2)
            //    angle = 100000;
            const edgeToRectEdgeDist = lineSegToLineDist(pt1, pt2, pt3, pt4);
            return dist(pt1, pt2) / (angle * angle * angle * edgeToRectEdgeDist);
        }

    const topScoreFunc = scoreFunc(
        new cv.Point(0, 0), 
        new cv.Point(edgeRect.top.width, 0)
    );
    const bottomScoreFunc = scoreFunc(
        new cv.Point(0, edgeRect.bottom.height), 
        new cv.Point(edgeRect.bottom.width, edgeRect.bottom.height)
    );
    const leftScoreFunc = scoreFunc(
        new cv.Point(0, 0),
        new cv.Point(0, edgeRect.left.height)
    );
    const rightScoreFunc = scoreFunc(
        new cv.Point(edgeRect.right.width, 0),
        new cv.Point(edgeRect.right.width, edgeRect.right.height)
    );

    const FPS = 30;
    function processVideo() {
        let begin = new Date().getTime();
        try {
            if (!streaming) {
                // clean and stop.
                src.delete();
                card.delete();
                linesMat.delete();
                for (let key in edgeMat)
                    edgeMat[key].delete();
                return;
            }
            // start processing.
            cap.read(src);

            let topEdges = findPotentialEdges(edgeRect.top, src, edgeMat.horizontal, edgeMat.horizontalGray, topScoreFunc);
            let rightEdges = findPotentialEdges(edgeRect.right, src, edgeMat.vertical, edgeMat.verticalGray, rightScoreFunc);
            let bottomEdges = findPotentialEdges(edgeRect.bottom, src, edgeMat.horizontal, edgeMat.horizontalGray, bottomScoreFunc);
            let leftEdges = findPotentialEdges(edgeRect.left, src, edgeMat.vertical, edgeMat.verticalGray, leftScoreFunc);
            

            let { tl, tr, br, bl } = findBestQuadrilateral(topEdges, rightEdges, bottomEdges, leftEdges, cardRatio);


            if (tl && tr && br && bl) {
                toggle()
                let finalDestCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width - 1, 0, width - 1, height - 1, 0, height - 1]); //
                let srcCoords = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
                let dsize = new cv.Size(width, height);
                let M = cv.getPerspectiveTransform(srcCoords, finalDestCoords)
                cv.warpPerspective(src, card, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
                
                requestAnimationFrame(() => cv.imshow('cardOutput', card));
            }

            // schedule the next one.
            let took = Date.now() - begin;
            let delay = 1000/FPS - took;
            setTimeout(processVideo, delay);
            if (streaming)
                errorOutput.innerHTML = '<p>FPS: ' + Math.round((1000/took)) + '</p>';
            //requestAnimationFrame(processVideo);
        } catch (err) {
            utils.printError(err);
        }
    };

    // schedule the first one.
    setTimeout(processVideo, 0);
}

function drawPoint(ctx, pt) {
    if (!pt)
        return;
    ctx.beginPath();
    ctx.strokeStyle = '#FF0000';
    ctx.arc(pt.x, pt.y, 3, 0, 2 * Math.PI);
    ctx.stroke();
}

function drawLine(ctx, line) {
    if (!line || !line.pt1)
        return;
    ctx.beginPath();
    ctx.strokeStyle = '#000';
    ctx.moveTo(line.pt1.x, line.pt1.y);
    ctx.lineTo(line.pt2.x, line.pt2.y);
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.closePath();
}

function findBestQuadrilateral(topEdges, rightEdges, bottomEdges, leftEdges, cardRatio) {
    let bestQuad = { tl: null, tr: null, br: null, bl: null };
    let bestScore = 0;

    topEdges.forEach(t => {
        rightEdges.forEach(r => {
            bottomEdges.forEach(b => {
                leftEdges.forEach(l => {
                    tl = findIntersection(t.pt1, t.pt2, l.pt1, l.pt2);
                    tr = findIntersection(t.pt1, t.pt2, r.pt1, r.pt2);
                    br = findIntersection(b.pt1, b.pt2, r.pt1, r.pt2);
                    bl = findIntersection(b.pt1, b.pt2, l.pt1, l.pt2);

                    let len = {
                        top: dist(tl, tr),
                        left: dist(tl, bl),
                        right: dist(tr, br),
                        bottom: dist(bl, br)
                    }
                    
                    let angles = [
                        angleBetweenLineSegs(tl, tr, tr, br),
                        angleBetweenLineSegs(tr, tl, tl, bl),
                        angleBetweenLineSegs(bl, br, br, tr),
                        angleBetweenLineSegs(br, bl, bl, tl)
                    ];

                    let ratios = [
                        [len.top, len.bottom],
                        [len.left, len.right],
                        [dist(tl, br), dist(tr, bl)],
                        [len.top / len.left, len.bottom / len.right],
                        [len.top / len.right, len.bottom / len.left],
                        [cardRatio, len.top / len.left],
                        [cardRatio, len.bottom / len.right],
                        [cardRatio, len.top / len.right],
                        [cardRatio, len.bottom / len.left]
                    ];

                    // 0 - 360
                    let angleScore = angles.reduce((acc, angle) => acc - Math.abs(DEG_90 - angle), Math.PI * 2) * 180 / Math.PI;
                    // 0 - 100
                    let ratioScore = ratios.reduce((acc, x) => acc * Math.min(x[0]/x[1], x[1]/x[0]), 100);

                    if (angleScore < 330 || ratioScore < 95)
                        return;
                    
                    console.log('Found OK quad');
                    
                    let score = angleScore * ratioScore;
                    if (score > bestScore) {
                        bestScore = score;
                        bestQuad = {tl, tr, br, bl};
                        utils.printError(`Angle: ${angleScore}<br>Ratio: ${ratioScore}<br>Total: ${score}`);
                    }
                });
            });
        });
    });

    return bestQuad;
}

function findPotentialEdges(rect, img, mat, matGray, scoreFunc) {
    let resizedSize = new cv.Size(Math.floor(rect.width / 2), Math.floor(rect.height / 2));
    cv.resize(img.roi(rect), mat, resizedSize, 0, 0, cv.INTER_AREA);

    cv.cvtColor(mat, matGray, cv.COLOR_RGBA2GRAY, 0);
    cv.Canny(matGray, matGray, 20, 30, 3, true);

    let size = Math.max(resizedSize.width, resizedSize.height);
    const rho = 1;
    const theta = Math.PI / 180;
    const thresh = size / 10;
    const minLineLen = size / 5;
    const maxLineGap = 2;
    cv.HoughLinesP(matGray, linesMat, rho, theta, thresh, minLineLen, maxLineGap);
    let lines = [];
    for (let i = 0; i < linesMat.rows; ++i) {
        let pt1 = new cv.Point(linesMat.data32S[i * 4], linesMat.data32S[i * 4 + 1]);
        let pt2 = new cv.Point(linesMat.data32S[i * 4 + 2], linesMat.data32S[i * 4 + 3]);
        let score = scoreFunc(pt1, pt2);
        lines.push({pt1, pt2, score});
    }

    lines.sort((l1, l2) => l2.score - l1.score);

    let scaleX = rect.width / resizedSize.width;
    let scaleY = rect.height / resizedSize.height;

    return lines.slice(0, 6).map(line => {
        line.pt1.x = line.pt1.x * scaleX + rect.x;
        line.pt2.x = line.pt2.x * scaleX + rect.x;
        line.pt1.y = line.pt1.y * scaleY + rect.y;
        line.pt2.y = line.pt2.y * scaleY + rect.y;
        return line;
    });
}

function linePassingPoints(pt1, pt2) {
    let a = pt1.y - pt2.y;
    let b = pt2.x - pt1.x;
    let c = -b * pt1.y - a * pt1.x;
    return {a, b, c};
}

function lineSegToLineDist(seg1, seg2, line1, line2) {
    const {a, b, c} = linePassingPoints(line1, line2);

    let denom = Math.sqrt(a * a + b * b);
    let dist1 = Math.abs(a * seg1.x + b * seg1.y + c) / denom;
    let dist2 = Math.abs(a * seg2.x + b * seg2.y + c) / denom;

    return Math.min(dist1, dist2);
}

function dist(pt1, pt2) {
    let x = pt1.x - pt2.x;
    let y = pt1.y - pt2.y;
    return Math.sqrt(x * x + y * y);
}

function angleBetweenLineSegs(a, c, b, d) {
    let angle = realAngleBetweenLineSegs(a, c, b, d)

    if (angle > DEG_90)
        angle = Math.PI - angle;

    return angle;
}

function realAngleBetweenLineSegs(a, c, b, d) {
    let alpha0 = Math.atan2(c.y - a.y, c.x - a.x);
    let alpha1 = Math.atan2(d.y - b.y, d.x - b.x);
    let angle = Math.abs(alpha0 - alpha1);

    return angle;
}


function findIntersection(a, c, b, d) {
    let l1 = linePassingPoints(a, c);
    let l2 = linePassingPoints(b, d);

    let div = l1.a * l2.b - l2.a * l1.b;

    if (div == 0)
        return new cv.Point(Number.MAX_VALUE, Number.MAX_VALUE);

    let x = (l1.b * l2.c - l2.b * l1.c) / div;
    let y = (l2.a * l1.c - l1.a * l2.c) / div;

    return new cv.Point(x, y);
}
