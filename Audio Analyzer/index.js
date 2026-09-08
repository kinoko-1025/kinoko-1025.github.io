const fileInput = document.getElementById("audio-file");
const number = document.getElementById("number");


fileInput.addEventListener("change", async (event) => {

    const file = event.target.files[0];

    if (!file) return;
    
    console.log(file.name);
    console.log(file.size);
    console.log(file.type);
    
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const data = audioBuffer.getChannelData(0);
    
    concole.log(data);
    console.log(audioBuffer);

    let number = audioBuffer;



});

number.textContent = value;
