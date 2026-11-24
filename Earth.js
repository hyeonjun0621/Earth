var canvas;
var gl;

var ROWS = ETOPO_ROWS; // 위도 -90 ~ 90
var COLS = ETOPO_COLS; // 경도 -180 ~ 180
var EARTH_RADIUS = 6371000.0;
var exaggeration = 25.0; // 고도 과장 배율

var pointsArray = [];
var normalsArray = [];
var colorsArray = [];
var indexArray = [];

var spinAngle = 0.0; // 자전각
var spinSpeed = 20.0; // 자전속도
var tilt = 23.5; // 자전축 기울기
var lightAngle = 0.0; // 광원 방향 각
var lightSpeed = 8.0; // 광원 회전 속도

var lightAmbient  = vec4(0.1, 0.1, 0.1, 1.0); // 광원의 주변광 세기
var lightDiffuse  = vec4(1.0, 1.0, 1.0, 1.0); // 광원의 확산광 세기
var lightSpecular = vec4(0.3, 0.3, 0.3, 1.0); // 광원의 정반사광 세기
var materialShininess = 30.0; // 반짝임 계수

var eye = vec3(0.0, 0.8, 3.0);
var at  = vec3(0.0, 0.0, 0.0);
var up  = vec3(0.0, 1.0, 0.0);

var modelViewMatrixLoc, projectionMatrixLoc, normalMatrixLoc, lightPositionLoc;
var lastTime = 0;

// 고도에 따른 색 변화 
function elevationColor(h) {
    if (h <= 0) return vec4(0.05, 0.25, 0.60, 1.0); // 바다
    if (h < 500)  return mix(vec4(0.15, 0.45, 0.15, 1.0), vec4(0.45, 0.55, 0.25, 1.0), h / 500);
    if (h < 2000) return mix(vec4(0.45, 0.55, 0.25, 1.0), vec4(0.50, 0.38, 0.25, 1.0), (h - 500) / 1500);
    if (h < 4500) return mix(vec4(0.50, 0.38, 0.25, 1.0), vec4(0.95, 0.95, 0.95, 1.0), (h - 2000) / 2500);
    return vec4(0.95, 0.95, 0.95, 1.0); // 만년설
}
// 격자의 (i행, j열)을 1차원 배열 번호로 변경
function index(i, j) { return i * COLS + j; }

// 지형 메시(위치·색·법선·인덱스)를 한 번에 만드는 함수
function buildMesh() {

    // 정점 위치 : (위도, 경도, 고도) -> (x, y, z)
    for (var i = 0; i < ROWS; i++) {
        var lat = radians(-90 + i);
        for (var j = 0; j < COLS; j++) {
            var lon = radians(-180 + j);
            var h = etopoData[index(i, j)];
            var r = 1.0 + exaggeration * Math.max(h, 0) / EARTH_RADIUS;
            pointsArray.push(vec4(r * Math.cos(lat) * Math.sin(lon),
                                  r * Math.sin(lat),
                                  r * Math.cos(lat) * Math.cos(lon), 1.0));
            colorsArray.push(elevationColor(h));
        }
    }

    // 정점 법선 : 이웃 정점 차이의 외적
    for (var i = 0; i < ROWS; i++) {
        for (var j = 0; j < COLS; j++) {
            if (i == 0 || i == ROWS - 1) {
                normalsArray.push(vec4(0.0, i == 0 ? -1.0 : 1.0, 0.0, 0.0));
                continue;
            }
            var jm = (j == 0) ? COLS - 2 : j - 1;
            var jp = (j == COLS - 1) ? 1 : j + 1;
            var t1 = subtract(pointsArray[index(i, jp)], pointsArray[index(i, jm)]);
            var t2 = subtract(pointsArray[index(i + 1, j)], pointsArray[index(i - 1, j)]);
            var n = normalize(cross(vec3(t1[0], t1[1], t1[2]), vec3(t2[0], t2[1], t2[2])));
            normalsArray.push(vec4(n[0], n[1], n[2], 0.0));
        }
    }

    // 격자 한 칸 = 삼각형 2개
    for (var i = 0; i < ROWS - 1; i++) {
        for (var j = 0; j < COLS - 1; j++) {
            var a = index(i, j), b = index(i + 1, j), c = index(i + 1, j + 1), d = index(i, j + 1);
            indexArray.push(a, d, c, a, c, b);
        }
    }
}

window.onload = function init() {
    canvas = document.getElementById("gl-canvas");
    gl = WebGLUtils.setupWebGL(canvas);
    if (!gl) { alert("WebGL isn't available"); }

    // WebGL 구성
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);

    // 셰이더 및 버퍼 초기화
    var program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    // 지형 메시 생성
    buildMesh();

    // 정점 데이터를 GPU로 전송
    var vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(pointsArray), gl.STATIC_DRAW);
    var vPosition = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    var nBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(normalsArray), gl.STATIC_DRAW);
    var vNormal = gl.getAttribLocation(program, "vNormal");
    gl.vertexAttribPointer(vNormal, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vNormal);

    var cBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(colorsArray), gl.STATIC_DRAW);
    var vColor = gl.getAttribLocation(program, "vColor");
    gl.vertexAttribPointer(vColor, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vColor);

    var iBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indexArray), gl.STATIC_DRAW);

    // uniform 변수 위치 저장
    modelViewMatrixLoc  = gl.getUniformLocation(program, "modelViewMatrix");
    projectionMatrixLoc = gl.getUniformLocation(program, "projectionMatrix");
    normalMatrixLoc     = gl.getUniformLocation(program, "normalMatrix");
    lightPositionLoc    = gl.getUniformLocation(program, "lightPosition");

    // 조명 값 전달
    gl.uniform4fv(gl.getUniformLocation(program, "lightAmbient"), flatten(lightAmbient));
    gl.uniform4fv(gl.getUniformLocation(program, "lightDiffuse"), flatten(lightDiffuse));
    gl.uniform4fv(gl.getUniformLocation(program, "lightSpecular"), flatten(lightSpecular));
    gl.uniform1f(gl.getUniformLocation(program, "shininess"), materialShininess);

    // 투영 행렬 전달
    var projectionMatrix = perspective(45.0, canvas.width / canvas.height, 0.1, 20.0);
    gl.uniformMatrix4fv(projectionMatrixLoc, false, flatten(projectionMatrix));

    // 애니메이션 시작
    requestAnimFrame(render);
};

function render(time) {
    //경과 시간 계산
    var dt = lastTime ? (time - lastTime) / 1000.0 : 0;
    lastTime = time;

    // 자전
    spinAngle = (spinAngle + spinSpeed * dt) % 360;
    // 조명 변화
    lightAngle = (lightAngle + lightSpeed * dt) % 360;

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 변환 행렬 계산
    var viewMatrix = lookAt(eye, at, up);
    var modelMatrix = mult(rotateZ(tilt), rotateY(spinAngle));
    var modelViewMatrix = mult(viewMatrix, modelMatrix);

    // 광원 방향을 눈 좌표계로 변환해서 전달
    var a = radians(lightAngle);
    var lightPosition = mult(viewMatrix, vec4(Math.sin(a), 0.0, Math.cos(a), 0.0));

    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(modelViewMatrix));
    gl.uniformMatrix3fv(normalMatrixLoc, false, flatten(normalMatrix(modelViewMatrix, true)));
    gl.uniform4fv(lightPositionLoc, flatten(lightPosition));

    gl.drawElements(gl.TRIANGLES, indexArray.length, gl.UNSIGNED_SHORT, 0);

    requestAnimFrame(render);
}
