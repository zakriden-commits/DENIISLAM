export class Voice {
  constructor(send,notify){this.send=send;this.notify=notify;this.stream=null;this.pc=null;this.pending=[];this.enabled=false;this.creating=false;this.generation=0;this.config={iceServers:[{urls:'stun:stun.l.google.com:19302'}]};}
  async enable(){
    if(!navigator.mediaDevices?.getUserMedia){this.notify('Микрофон недоступен. Нужен HTTPS и разрешение браузера.');return false;}
    try{this.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});this.enabled=true;return true;}
    catch{this.notify('Микрофон не разрешён. Играть можно без голосового чата.');return false;}
  }
  async configure(base){try{const r=await fetch(base+'/api/voice');if(r.ok){const data=await r.json();this.config={iceServers:data.iceServers};if(this.enabled&&!data.relay)this.notify('Голос: прямое соединение. В некоторых мобильных сетях нужен TURN-сервер.');}}catch{}}
  create(){if(this.pc)return this.pc;const pc=this.pc=new RTCPeerConnection(this.config);if(this.stream){for(const track of this.stream.getTracks())pc.addTrack(track,this.stream);}else pc.addTransceiver('audio',{direction:'recvonly'});
    pc.onicecandidate=e=>{if(e.candidate)this.send({type:'signal',data:{candidate:e.candidate.toJSON()}});};
    pc.ontrack=e=>{const audio=document.getElementById('remoteAudio');audio.srcObject=e.streams[0]||new MediaStream([e.track]);audio.play().catch(()=>this.notify('Нажмите MIC, чтобы разрешить воспроизведение голоса.'));};
    pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed')this.notify('Голос не соединён: для этой сети нужен TURN. Игра продолжает работать.');};return pc;
  }
  async offer(){if(this.pc||this.creating)return;this.creating=true;const gen=this.generation;try{const pc=this.create();const offer=await pc.createOffer();if(gen!==this.generation)return;await pc.setLocalDescription(offer);this.send({type:'signal',data:{description:pc.localDescription}});}catch(e){this.notify('Голосовой канал пока недоступен.');}finally{this.creating=false;}}
  async receive(data){try{if(!data||typeof data!=='object')return;const pc=this.create();if(data.description){await pc.setRemoteDescription(data.description);for(const c of this.pending.splice(0))await pc.addIceCandidate(c);if(data.description.type==='offer'){await pc.setLocalDescription(await pc.createAnswer());this.send({type:'signal',data:{description:pc.localDescription}});}}else if(data.candidate){if(pc.remoteDescription)await pc.addIceCandidate(data.candidate);else this.pending.push(data.candidate);}}catch{}}
  mute(){if(!this.stream)return false;this.enabled=!this.enabled;for(const t of this.stream.getAudioTracks())t.enabled=this.enabled;return this.enabled;}
  resetPeer(){this.generation++;this.pc?.close();this.pc=null;this.pending=[];this.creating=false;document.getElementById('remoteAudio').srcObject=null;}
  close(){this.resetPeer();this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.enabled=false;}
}
