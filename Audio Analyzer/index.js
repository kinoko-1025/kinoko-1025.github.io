const fileInput = document.getElementById("audio-file");
const number = document.getElementById("number");


// 表示する数値
let value = 12345;


// 画面に表示
number.textContent = value;


fileInput.addEventListener("change", (event) => {

    const file = event.target.files[0];

    if (!file) return;

    console.log(file);

});