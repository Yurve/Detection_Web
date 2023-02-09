//카메라 On
window.setVideo = (width, height) => {

    //비디오를 지정하고 화면에 보여준다.
    var video = document.querySelector("#video")
    video.width = width; video.height = height;

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
            video.srcObject = stream;
            // 좌우 반전 코드 
            video.style.transform = "scaleX(-1)";
            video.play();
        });
    }
}

var _client;   //전역변수로 mqtt client 할당
var _characteristic;   //전역변수로 ble characteristic 할당
var _Dotnet;  //전역변수로 dotnet 객체 할당

//MQTT On
window.SetMqtt = (CameraidDarcy) => {
    const TOPIC_MOTOR = "camera/update/degree/syn";
    const TOPIC_WEBRTC = "call/start";
    const TOPIC_WEBRTC_FIN = "call/stop";

    var client_id = Math.random().toString(36).substring(2, 12); //random한 id 
    //connection **************************
    var client = new Paho.MQTT.Client("**************************", Number(8090), client_id);
    client.connect({ useSSL: true, onSuccess: onConnect }); //connect the client using SSL 


    function onConnect() {
        //구독할 각종 토픽들을 구독한다

        //mqtt client를 전역변수로 할당한다.
        _client = client;

        _client.subscribe(TOPIC_MOTOR);
        _client.subscribe(TOPIC_WEBRTC);
        _client.subscribe(TOPIC_WEBRTC_FIN);
        _client.onMessageArrived = onMessageArrived;
    }
    //콜백 메서드로 메시지가 도착하면 호출 됨.
    function onMessageArrived(message) {
        //메시지 구분 
        console.log("topic: " + message.destinationName + " onMessageArrived: " + message.payloadString);

        // //메시지가 도착하면, 각각의 토픽에 따라서 다른 동작을 한다.
        if (message.destinationName === TOPIC_MOTOR) {
            //모터 제어
            let data = JSON.parse(message.payloadString);
            if (data.CameraId == CameraidDarcy) {
                //JSON 객체로부터 각도를 가져온다.
                let degree = data.Degree + ".";
                if (_characteristic != null) {
                    //BLE로 각도를 전송한다.
                    _characteristic.writeValue(new TextEncoder().encode(degree));
                }
            }
        } else if (message.destinationName === TOPIC_WEBRTC) {
            //webrtc 연결
            try {
                let data = JSON.parse(message.payloadString);
                if (data.CameraId == CameraidDarcy) {
                    //webRTC 연결을 시작한다.
                    _Dotnet.invokeMethodAsync("showWebRTC", true);
                }
            } catch (e) {
                console.log(e);
            }
        } else if (message.destinationName === TOPIC_WEBRTC_FIN) {
            //webrtc 연결 종료
            try {
                let data = JSON.parse(message.payloadString);
                if (data.CameraId == CameraidDarcy) {
                    //webRTC 연결을 종료한다.
                    _Dotnet.invokeMethodAsync("showWebRTC", false);
                }
            } catch (e) {
                console.log(e);
            }
        }
    }
}

//썸네일 전송
window.SendThumbnail = (CameraId) => {
    const TOPIC_PREVIEW = "camera/update/thumbnail";
    //연결이 되었다면, 썸네일 전송을 시작한다.
    setTimeout(sendThumbnail, 500);

    function sendThumbnail() {
        var video = document.querySelector("#video");
        var canvas = document.getElementById('canvas_image');
        canvas.width = video.width; canvas.height = video.height;
        var context = canvas.getContext('2d');
        context.scale(-1, 1); context.translate(-canvas.width, 0); //좌우 반전이 된 상태이므로 다시 좌우 반전을 해준다.
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        result64 = canvas.toDataURL("image/jpeg", 0.7).replace("data:image/jpeg;base64,", ""); //앞에 붙는 문자열 제거


        var data = new Object();
        data.CameraId = CameraId;
        data.Thumbnail = result64;

        message = new Paho.MQTT.Message(JSON.stringify(data));  //썸네일 내용 CameraId, Thumbnail
        message.destinationName = TOPIC_PREVIEW;    //보낼 토픽
        if (_client != null) {
            _client.send(message);  // MQTT로 썸네일 전송
        } else {
            console.log("mqtt client is not connected");
        }

        setTimeout(sendThumbnail, 1000);
    }
}

//opencv.js 를 이용한 움직임 감지
window.Camshift = () => {
    let video = document.querySelector("#video", willReadFrequently = true);
    let canvasOutput = document.querySelector("#canvasOutput", willReadFrequently = true);;

    let cap = new cv.VideoCapture(video);
    let img_first = new cv.Mat(video.height, video.width, cv.CV_8UC4); let img_first_gray = new cv.Mat();
    let img_second = new cv.Mat(video.height, video.width, cv.CV_8UC4); let img_second_gray = new cv.Mat();
    let img_third = new cv.Mat(video.height, video.width, cv.CV_8UC4); let img_third_gray = new cv.Mat();
    cap.read(img_first); cap.read(img_second);
    cv.flip(img_first, img_first, 1); cv.flip(img_second, img_second, 1);

    const threshold_move = 50;    // 달라진 픽셀 값 기준치 설정 (defalut=50)
    const diff_compare = 20;      // 달라진 픽셀 갯수 기준치 설정 (defalut=10)
    const FPS = 15;               // FPS 설정 (default=15)

    function opencv_js_motion_detect() {
        cap.read(img_third); cv.flip(img_third, img_third, 1);
        let src = img_third.clone(); //src는 원본 이미지를 복사한 것
        //그레이 스케일로 변환
        cv.cvtColor(img_first, img_first_gray, cv.COLOR_RGBA2GRAY, 0);
        cv.cvtColor(img_second, img_second_gray, cv.COLOR_RGBA2GRAY, 0);
        cv.cvtColor(img_third, img_third_gray, cv.COLOR_RGBA2GRAY, 0);
        //차이 비교를 위한 이미지 생성
        let diff_1 = new cv.Mat();
        let diff_2 = new cv.Mat();
        //차이 비교
        cv.absdiff(img_first_gray, img_second_gray, diff_1);
        cv.absdiff(img_second_gray, img_third_gray, diff_2);
        //차이 비교 이미지를 이진화
        let diff_1_thres = new cv.Mat();
        let diff_2_thres = new cv.Mat();
        //threshold_move 값보다 크면 255, 작으면 0
        cv.threshold(diff_1, diff_1_thres, threshold_move, 255, cv.THRESH_BINARY);
        cv.threshold(diff_2, diff_2_thres, threshold_move, 255, cv.THRESH_BINARY);
        //두 차이 비교 이미지의 AND 연산
        let diff = new cv.Mat();
        cv.bitwise_and(diff_1_thres, diff_2_thres, diff);
        //AND 연산 결과에서 0이 아닌 픽셀의 갯수를 구함
        let diff_cnt = cv.countNonZero(diff);
        //AND 연산 결과에서 0이 아닌 픽셀의 좌표를 초기화
        let firstNonZeroIndex = [-1, -1];
        let lastNonZeroIndex = [-1, -1];

        if (diff_cnt > diff_compare) {
            let nZero = new cv.Mat(diff.rows, diff.cols, cv.CV_8UC1); //diff의 행과 열을 가진 nZero 생성
            for (let i = 0; i < diff.rows; i++) {
                for (let j = 0; j < diff.cols; j++) {
                    let index = i * diff.cols + j;
                    if (diff.data[index] !== 0) {
                        nZero.data[index] = diff.data[index];
                        //0이 아닌 픽셀의 좌표를 구함 
                        // 왼쪽 위의 좌표 값은 firstNonZeroIndex, 오른쪽 아래의 좌표 값은 lastNonZeroIndex
                        if (firstNonZeroIndex[0] === -1 || firstNonZeroIndex[0] > i && firstNonZeroIndex[1] > j) {
                            firstNonZeroIndex = [i, j];
                        }

                        if (lastNonZeroIndex[0] === -1 || lastNonZeroIndex[0] < i && lastNonZeroIndex[1] < j) {
                            lastNonZeroIndex = [i, j]
                        }
                    }
                }
            }
            //0이 아닌 픽셀의 좌표를 이용하여 사각형 그리기
            let point1 = new cv.Point(firstNonZeroIndex[1], firstNonZeroIndex[0]);
            let point2 = new cv.Point(lastNonZeroIndex[1], lastNonZeroIndex[0]);

            cv.rectangle(src, point1, point2, [0, 0, 255, 255], 1);
            cv.putText(src, "Motion Detected", new cv.Point(10, 10), cv.FONT_HERSHEY_SIMPLEX, 0.3, [0, 0, 255, 255]);
        }
        try {
            cv.imshow(canvasOutput, src);
        } catch (err) {
            console.log(err);
        }
        // 다음 비교를 위해 영상 저장 및 메모리 해제
        src.delete();
        diff_1.delete(); diff_2.delete(); diff_1_thres.delete(); diff_2_thres.delete(); diff.delete();
        img_first.delete();
        img_first = img_second.clone();
        img_second.delete();
        img_second = img_third.clone();
    }

    function async_motion_detect() {
        opencv_js_motion_detect();
        setTimeout(async_motion_detect, 1000 / FPS);
    }

    async_motion_detect(); // 비동기로 움직임 감지 시작
}

//opencv를 사용하지 않고 움직임 감지 
window.js_motion = () => {
    // 원리 
    // 1. 이미지 -> 캔버스에 담기 (ctx) , RGBA의 정보가 담긴 부분을 저장 (imgDataPrev) 
    // 2. 32ms 뒤에 다시 이미지 -> 캔버스에 담기 (ctx) , RGBA의 정보가 담긴 부분을 저장 (imgData)
    // 3. 1번과 2번에 저장한 RGBA를 각각 0.5로 나눠서 더한다. 
    // 만약 움직임의 변화가 없다면, ex) 처음 사진의 1번 픽셀 R값이 4 였고, 두번째 사진의 1번 픽셀 R값도 4였다면, (4+4)/2 로 4로 동일하게 나온다.
    // 움직임의 변화가 있다면, ex) 처음 사진의 1번 픽셀 R값이 5였고, 두번째 사진의 사진의 1번 픽셀 R값이 200이였다면 (5+200)/2 로 102.5가 나온다.
    // 따라서 변화가 생긴만큼 그림을 그리기 때문에 움직임 감지가 가능한 그림이 나온다. 단 alpha값이 최대값이므로 투명도가 255이므로 흐릿한 사진이다. 

    let alpha = 0.5;
    let version = 0;
    let greyScale = true;

    let video = document.querySelector('#video');
    let canvas = document.getElementById('snapshotOutput');
    let canvasFinal = document.getElementById('canvasFinal');
    let ctx = canvas.getContext('2d', { willReadFrequently: true });
    let ctxFinal = canvasFinal.getContext('2d');
    let imgDataPrev = [];
    let imgData = null;

    setInterval(snapshot, 32);

    function snapshot() {
        canvas.width = video.width;
        canvas.height = video.height;
        canvasFinal.width = video.width;
        canvasFinal.height = video.height;

        ctx.scale(-1, 1); // Flip horizontally. 
        ctx.drawImage(video, -canvas.width, 0, video.width, video.height); // Draw the video frame to the canvas.

        // Must capture image data in new instance as it is a live reference.
        // Use alternative live referneces to prevent messed up data.
        imgDataPrev[version] = ctx.getImageData(0, 0, video.width, video.height);
        version = (version == 0) ? 1 : 0;

        imgData = ctx.getImageData(0, 0, video.width, video.height);

        let length = imgData.data.length; //426x240x4 == [가로x세로xRGBA]
        let x = 0;
        while (x < length) {
            if (!greyScale) {
                // Alpha blending formula: out = (alpha * new) + (1 - alpha) * old.
                imgData.data[x] = alpha * (255 - imgData.data[x]) + ((1 - alpha) * imgDataPrev[version].data[x]); //Red
                imgData.data[x + 1] = alpha * (255 - imgData.data[x + 1]) + ((1 - alpha) * imgDataPrev[version].data[x + 1]); //green
                imgData.data[x + 2] = alpha * (255 - imgData.data[x + 2]) + ((1 - alpha) * imgDataPrev[version].data[x + 2]); //blue
                imgData.data[x + 3] = 255; //alpha;
            } else {
                // GreyScale.
                let av = (imgData.data[x] + imgData.data[x + 1] + imgData.data[x + 2]) / 3;
                let av2 = (imgDataPrev[version].data[x] + imgDataPrev[version].data[x + 1] + imgDataPrev[version].data[x + 2]) / 3;
                let blended = alpha * (255 - av) + ((1 - alpha) * av2);
                imgData.data[x] = blended;
                imgData.data[x + 1] = blended;
                imgData.data[x + 2] = blended;
                imgData.data[x + 3] = 255;
            }
            x += 4; //RGBA 이므로 4씩 증가한다.
        }
        ctxFinal.putImageData(imgData, 0, 0);
    }
}

//블루투스 켜기 
window.SetBluetooth = () => {
    if (!navigator.bluetooth) {
        console.log('Web Bluetooth API is not available in this browser!');
        return false
    } else {
        connect();
    }

    async function connect() {
        navigator.bluetooth.requestDevice({
            filters: [{ services: ["0000ffe0-0000-1000-8000-00805f9b34fb"] }] //아두이노에 연결된 HM10의 표준 UUID
        }).then(device => {
            return device.gatt.connect(); //블루투스 연결
        }).then(server => {
            //서비스는 특성의 모음입니다. 예를 들어 "심장 박동 모니터"라는 서비스에는 "심장 박동 측정값"과 같은 특성이 포함됩니다. 
            //최상위 구조체, 다수의 Characteristics 보유
            return server.getPrimaryService("0000ffe0-0000-1000-8000-00805f9b34fb");
        }).then(service => {
            //특성에는 하나의 값과 특성의 값을 설명하는 0-n 설명자가 포함됩니다. 특성은 일종의 유형으로, 클래스와 유사하다고 생각하면 됩니다. 
            return service.getCharacteristic("0000ffe1-0000-1000-8000-00805f9b34fb");
        }).then(characteristic => {
            _characteristic = characteristic; //전역변수로 선언
            receiveData(characteristic); //데이터 수신
        });
    }


    function receiveData(characteristic) {
        characteristic.startNotifications().then(() => {
            characteristic.addEventListener('characteristicvaluechanged', event => {
                const value = new TextDecoder().decode(event.target.value);
                console.log('Received ' + value);
            });
        });

    }

}

//tensorflow.js를 이용한 객체 검출
window.tfjs = () => {
    let video = document.querySelector("#video");
    let canvas = document.getElementById('videoCanvas_detect');
    let flippedCanvas = document.createElement('canvas'); //반전이 될 캔버스
    canvas.width = 640; canvas.height = 640; flippedCanvas.width = 640; flippedCanvas.height = 640;

    //모델을 로드한다.
    tf.loadGraphModel('model/model.json').then(model => {
        detect(model);
    });

    function detect(model) {
        const flippedCtx = flippedCanvas.getContext('2d', { willReadFrequently: true });
        flippedCtx.scale(-1, 1);
        flippedCtx.drawImage(video, -canvas.width, 0, 640, 640); //이미지를 그림
        const imgData = flippedCtx.getImageData(0, 0, 640, 640); //이미지 데이터를 가져온다.

        let ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(flippedCanvas, 0, 0, 640, 640); //이미지를 그림

        const tensor = tf.tidy(() => {
            return tf.browser.fromPixels(imgData).div(255.0).expandDims(0); //이미지를 텐서로 변환한다.
            // return tf.image.resizeBilinear(tf.browser.fromPixels(video), [640, 640]).div(255.0).expandDims(0); //이미지를 640x640으로 리사이즈한다.
        });

        model.executeAsync(tensor,).then(result => { //모델을 통해 예측한다.
            const [boxes, scores, classes, numDetections] = result;
            const boxes_data = boxes.dataSync(); //박스의 좌표
            const scores_data = scores.dataSync(); //박스의 점수
            const classes_data = classes.dataSync(); //박스의 클래스
            const numDetections_data = numDetections.dataSync()[0]; //박스의 갯수
            tf.dispose(result); //메모리 해제

            console.log(numDetections_data);

            var i;
            for (i = 0; i < numDetections_data; i++) {
                let [x1, y1, x2, y2] = boxes_data.slice(i * 4, (i + 1) * 4); //박스의 좌표
                // //비율을 수정한다. 426:240 -> 640:640 이므로 426/640 = 0.667 비율을 곱한다. 240/640 = 0.375 비율을 곱한다.
                x1 = x1 * 640;
                y1 = y1 * 640;
                x2 = x2 * 640;
                y2 = y2 * 640;

                const width = x2 - x1; //박스의 넓이
                const height = y2 - y1; //박스의 높이
                let klass = ""; //박스의 클래스
                if (classes_data[i] == 0) {
                    klass = "smoke";
                } else {
                    klass = "fire";
                }
                const score = scores_data[i].toFixed(2) * 100 + "%"; //박스의 점수

                //박스를 그린다.
                if (klass == "smoke") {
                    ctx.lineWidth = "4";  //선의 두께 
                    ctx.strokeStyle = "gray";  //선의 색
                    ctx.strokeRect(x1, y1, width, height);  //선을 그린다.

                    ctx.font = "20px Arial"; //글자의 크기와 폰트
                    ctx.fillStyle = "gray"; //글자의 색
                    ctx.fillText(klass + " " + score, x1, y1); //글자를 그린다.
                } else {
                    ctx.lineWidth = "4";
                    ctx.strokeStyle = "red";
                    ctx.strokeRect(x1, y1, width, height);

                    ctx.font = "20px Arial";
                    ctx.fillStyle = "red";
                    ctx.fillText(klass + " " + score, x1, y1);
                }
            }
            setTimeout(() => detect(model), 1000); //0.1초마다 반복한다.
        });
    }
}

//opencv.js를 이용해 얼굴을 검출한다.
window.faceDetect = () => {
    let video = document.querySelector('#video'); //비디오
    let src = new cv.Mat(video.height, video.width, cv.CV_8UC4);
    let dst = new cv.Mat(video.height, video.width, cv.CV_8UC4);
    let gray = new cv.Mat(); //흑백 이미지
    let cap = new cv.VideoCapture(video); //비디오를 캡쳐한다.
    let faces = new cv.RectVector(); //얼굴의 좌표
    let classifier = new cv.CascadeClassifier(); //얼굴을 검출하는 분류기
    let canvas = document.getElementById('canvas_face'); //얼굴을 그릴 캔버스
    const fileName = "model/haarcascade_frontalface_default.xml";

    //const _rootpath = "https://github.com/opencv/opencv/blob/master/data/haarcascades/";

    // async function createFileFromUrl(url) {
    //     try {
    //         const response = await fetch(url);
    //         const fileData = await response.text();
    //         return fileData;
    //     } catch (error) {
    //         console.error(error);
    //     }
    // }

    // async function loadFile() {
    //     const fileData = await createFileFromUrl(fileName);
    //     classifier.load(fileData);
    // }

    //loadFile();

    function loadfileplz(url){
        fetch(url).then(function(response) {
            return response.text();
        }).then(function(text) {
            classifier.load(text);
        });
    }

    loadfileplz(fileName);

    const FPS = 30; //FPS
    function processVideo() {
        let begin = Date.now();
        // start processing.
        cap.read(src); //비디오를 읽는다.
        src.copyTo(dst); //src를 dst에 복사한다.
        cv.cvtColor(dst, gray, cv.COLOR_RGBA2GRAY, 0); //dst를 흑백으로 변환한다.
        // detect faces.
        classifier.detectMultiScale(gray, faces, 1.1, 3, 0); //얼굴을 검출한다.
        // draw faces.
        for (let i = 0; i < faces.size(); ++i) {
            let face = faces.get(i);
            let point1 = new cv.Point(face.x, face.y);
            let point2 = new cv.Point(face.x + face.width, face.y + face.height);
            cv.rectangle(dst, point1, point2, [255, 0, 0, 255]);
        }
        cv.imshow(canvas, dst); //얼굴을 그린다.
        // schedule the next one.
        let delay = 1000 / FPS - (Date.now() - begin);
        setTimeout(processVideo, delay);
    }
    // schedule the first one.
    setTimeout(processVideo, 0);
}

//dotnet 객체를 가져온다.
window.dotnetHelper = (objRef) => {
    _Dotnet = objRef;
}

let camera;

//WebRTC 연결을 위한 객체 생성
async function initializeCamera(connectionId, userId, cameraId, url) {
    camera = new Camera(connectionId, userId, cameraId, url);
    camera.addEventListeners();

    await camera.getMedia();
    camera.createRTCPeerConnection();
}

async function sendOffer() {
    const offer = await camera.peerConnection.createOffer();
    camera.peerConnection.setLocalDescription(offer);

    console.log("Send offer");
    return JSON.stringify(offer);
}

async function sendAnswer(offer) {
    const jsonObject = JSON.parse(offer);
    const receivedOffer = new RTCSessionDescription(jsonObject);

    camera.peerConnection.setRemoteDescription(receivedOffer);
    console.log("Receive offer");

    const answer = await camera.peerConnection.createAnswer();
    camera.peerConnection.setLocalDescription(answer);

    console.log("Send answer");
    return JSON.stringify(answer);
}

function receiveAnswer(answer) {
    const jsonObject = JSON.parse(answer);
    const receivedAnswer = new RTCSessionDescription(jsonObject);

    camera.peerConnection.setRemoteDescription(receivedAnswer);
    console.log("Receive answer");
}

function receiveIce(ice) {
    const receivedIce = JSON.parse(ice);
    camera.peerConnection.addIceCandidate(receivedIce);
    console.log("Receive ice");
}

function getCurrentTime() {
    const today = new Date();
    const year = today.getFullYear().toString();

    let month = today.getMonth() + 1;
    month = month < 10 ? '0' + month.toString() : month.toString();

    let day = today.getDate();
    day = day < 10 ? '0' + day.toString() : day.toString();

    let hour = today.getHours();
    hour = hour < 10 ? '0' + hour.toString() : hour.toString();

    let minutes = today.getMinutes();
    minutes = minutes < 10 ? '0' + minutes.toString() : minutes.toString();

    let seconds = today.getSeconds();
    seconds = seconds < 10 ? '0' + seconds.toString() : seconds.toString();

    return year + month + day + hour + minutes + seconds;
}


//만약 페이지를 닫으면 mqtt 연결을 끊는다.
window.onbeforeunload = function () {
    if (_client != null) {
        _client.disconnect();
    }
}

//WebRTC 연결을 위한 클래스
class Camera {
    mediaStream;
    peerConnection;
    remoteVideo;
    url;


    constructor(connectionId, userId, cameraId, url) {
        this.localVideo = document.getElementById("video");

        this.muteButton = document.getElementById("muteButton");
        this.cameraButton = document.getElementById("cameraButton");
        this.camerasSelect = document.getElementById("camerasSelect");

        this.connectionId = connectionId;
        this.userId = userId;
        this.cameraId = cameraId;
        this.url = url;
    }

    handleMuteClick() {
        this.mediaStream
            .getAudioTracks()
            .forEach((track) => (track.enabled = !track.enabled));

        if (!this.muted) {
            this.muteButton.innerText = "Unmute";
            this.muted = true;

        } else {
            this.muteButton.innerText = "Mute";
            this.muted = false;
        }
    }

    handleCameraClick() {
        this.mediaStream
            .getVideoTracks()
            .forEach((track) => (track.enabled = !track.enabled));

        if (this.cameraOff) {
            if (this.localVideo.style.display == "none") {
                this.localVideo.style.display = "block";
            }

            this.cameraButton.innerText = "Turn Camera Off";
            this.cameraOff = false;

        } else {
            this.localVideo.style.display = "none";

            this.cameraButton.innerText = "Turn Camera On";
            this.cameraOff = true;
        }
    }

    async handleCameraChange() {
        await this.getMedia(this.camerasSelect.value);

        if (this.peerConnection) {
            const videoTrack = this.mediaStream.getVideoTracks()[0];

            const videoSender = this.peerConnection
                .getSenders()
                .find((sender) => sender.track.kind === "video");

            videoSender.replaceTrack(videoTrack);
        }
    }

    addEventListeners() {
        this.muteButton.addEventListener("click", () => this.handleMuteClick());
        this.cameraButton.addEventListener("click", () => this.handleCameraClick());
        this.camerasSelect.addEventListener("input", () => this.handleCameraChange());
    }

    async getCameras() {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter((device) => device.kind === "videoinput");
        const currentCamera = this.mediaStream.getVideoTracks()[0];
        for (const camera of cameras) {
            const option = document.createElement("option");
            option.value = camera.deviceId;
            option.text = camera.label;
            if (currentCamera.label === camera.label) {
                option.selected = true;
            }
            this.camerasSelect.appendChild(option);
        }
    }

    async getMedia(deviceId) {
        const initialConstrains = {
            audio: true,
            video: { facingMode: "user" },
        };
        const cameraConstraints = {
            audio: true,
            video: { deviceId: { exact: deviceId } },
        };

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia(
                deviceId ? cameraConstraints : initialConstrains
            );
            this.localVideo.srcObject = this.mediaStream;

            cap = new cv.VideoCapture(this.localVideo);

            if (!deviceId) {
                await this.getCameras();
            }

        } catch (err) {
            console.log(err);
        }
    }

    async handleIce(data) {
        if (data && data.candidate) {
            const connection = new signalR.HubConnectionBuilder().withUrl("http://" + url).build();
            await connection.start();

            console.log(data.candidate);
            const ice = JSON.stringify(data.candidate);
            connection.send("SendIce", ice, this.connectionId);
            console.log("Connection Id:", this.connectionId);
            console.log("Send ice");

            await connection.stop();
        }
    }

    handleAddStream(data) {
        if (data && data.stream) {
            this.remoteVideo = document.getElementById("remoteVideo");
            this.remoteVideo.srcObject = data.stream;
            //좌우 반전
            this.remoteVideo.style.transform = "scaleX(-1)";

        }
    }

    createRTCPeerConnection() {
        this.peerConnection = new RTCPeerConnection({
            iceServers: [
                {
                    urls: [
                        "stun:stun.l.google.com:19302",
                        "stun:stun1.l.google.com:19302",
                        "stun:stun2.l.google.com:19302",
                        "stun:stun3.l.google.com:19302",
                        "stun:stun4.l.google.com:19302",
                        "stun:stun.stunprotocol.org:3478",
                        "stun:stun.voiparound.com:3478",
                        "stun:stun.voipbuster.com:3478",
                        "stun:stun.voipstunt.com:3478",
                        "stun:stun.voxgratia.org:3478"
                    ],
                },
            ],
        });

        this.peerConnection.addEventListener("icecandidate", (event) => this.handleIce(event));
        this.peerConnection.addEventListener("addstream", (event) => this.handleAddStream(event));
        this.mediaStream.getTracks().forEach((track) => this.peerConnection.addTrack(track, this.mediaStream));
    }
}
