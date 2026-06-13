/**
 * LENS — AI Visual Dialogue
 * Chat-first layout + floating draggable/resizable camera.
 */
const App = (() => {
    const State={IDLE:'idle',STARTING:'starting',RUNNING:'running',ERROR:'error'};
    let _state=State.IDLE,_mediaStream=null,_ws=null,_audioOut=null;
    let _muted=false,_cameraOn=true,_subtitleText='';
    let _selectedRole='assistant';
    const ROLES={assistant:'你是AI视觉助手，请用中文简洁回答用户的问题。',teacher:'你是一位耐心的英语老师。用户用中文提问时，你用英文回答并附中文解释。',interviewer:'你是一位专业的面试官。针对用户的表现给出建设性反馈，帮助用户提升面试技巧。',friend:'你是用户的好朋友，聊天风格随意幽默，多用表情和口语，像跟老友聊天。',travel:'你是一位资深的旅行向导。根据用户展示的场景或问题，推荐目的地、美食和旅行攻略，语言充满画面感。',coach:'你是一位专业的健身教练。根据用户的身体状况和目标给出运动建议、饮食计划和动作指导，语言激励人心。',foodie:'你是一位美食评论家。看到食物画面时给出专业的品鉴意见，用生动的语言描述味道和口感。',tech:'你是一位科技顾问。用通俗易懂的方式解释技术概念，推荐电子产品，解答编程和IT相关问题。',storyteller:'你是一位故事大王。用生动有趣的语言讲故事，可以根据用户看到的画面即兴创作童话或小故事。',listener:'你是一位温暖的心理倾听者。用同理心倾听用户的烦恼，给出温和的反馈和建议，像一位值得信赖的朋友。'};
    function getInstructions(){return ROLES[_selectedRole]||ROLES.assistant}

    // Cost
    const Cost={audioInSec:0,videoFrames:0,textOutChars:0,audioOutChars:0,_t:null,
        startAudio(){if(!this._t)this._t=setInterval(()=>{this.audioInSec+=0.1},100);},
        stopAudio(){clearInterval(this._t);this._t=null;},
        reset(){this.stopAudio();this.audioInSec=0;this.videoFrames=0;this.textOutChars=0;this.audioOutChars=0;},
        estimate(){return(this.audioInSec*800*18.9+this.audioOutChars*3*75.1+this.textOutChars*2*8.3+this.videoFrames*200*8.3)/1e6;},
        format(){const c=this.estimate();if(c<1e-3)return'0';return'¥'+c.toFixed(c<0.01?4:3);},
    };
    function updateCost(){UI.setCostDisplay(Cost.format())}

    // Particles
    let _pts=[];
    function initParticles(){const c=UI.refs.particles;if(!c)return;c.width=innerWidth;c.height=innerHeight;const ctx=c.getContext('2d');_pts=Array.from({length:50},()=>({x:Math.random()*c.width,y:Math.random()*c.height,r:Math.random()*1.2+.3,vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3}));function draw(){if(!c.isConnected)return;ctx.clearRect(0,0,c.width,c.height);_pts.forEach(p=>{p.x+=p.vx;p.y+=p.vy;if(p.x<0)p.x=c.width;if(p.x>c.width)p.x=0;if(p.y<0)p.y=c.height;if(p.y>c.height)p.y=0;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle='oklch(0.58 0.18 31/.12)';ctx.fill()});requestAnimationFrame(draw)}draw()}

    // Waveform
    let _wv=new Array(60).fill(0);
    function drawWaveform(l){const c=UI.refs.waveform;if(!c||!c.isConnected)return;const ctx=c.getContext('2d'),w=c.width=c.offsetWidth,h=c.height=c.offsetHeight;_wv.push(Math.min(l*3,1));if(_wv.length>60)_wv.shift();ctx.clearRect(0,0,w,h);const bw=w/60;_wv.forEach((v,i)=>{const x=i*bw,bh=v*h*.8,by=(h-bh)/2;ctx.fillStyle='oklch(0.58 0.18 31/.3)';ctx.fillRect(x,by,bw-1,bh||1)})}

    // Chime
    function chime(){try{const a=new(window.AudioContext||window.webkitAudioContext)();if(a.state==='suspended')a.resume();[880,1100].forEach((f,i)=>{const o=a.createOscillator(),g=a.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(.06,a.currentTime+i*.08);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+i*.08+.2);o.connect(g);g.connect(a.destination);o.start(a.currentTime+i*.08);o.stop(a.currentTime+i*.08+.2)})}catch(e){}}

    // ── Drag & Resize ──────────────────────────────────────────────
    function initDragResize(){
        const float=UI.refs.cameraFloat,bar=UI.refs.cameraDragHandle,handle=UI.refs.cameraResizeHandle;
        if(!float||!bar)return;

        // Drag
        let dragging=false,dx=0,dy=0;
        bar.addEventListener('mousedown',e=>{dragging=true;dx=e.clientX-float.offsetLeft;dy=e.clientY-float.offsetTop;e.preventDefault()});
        document.addEventListener('mousemove',e=>{if(!dragging)return;const parent=float.parentElement;let nx=e.clientX-dx,ny=e.clientY-dy;nx=Math.max(0,Math.min(nx,parent.offsetWidth-float.offsetWidth));ny=Math.max(0,Math.min(ny,parent.offsetHeight-float.offsetHeight));float.style.right='auto';float.style.bottom='auto';float.style.left=nx+'px';float.style.top=ny+'px'});
        document.addEventListener('mouseup',()=>{dragging=false});

        // Resize
        let resizing=false,rx=0,ry=0,rw=0,rh=0;
        handle.addEventListener('mousedown',e=>{resizing=true;rx=e.clientX;ry=e.clientY;rw=float.offsetWidth;rh=float.offsetHeight;e.preventDefault();e.stopPropagation()});
        document.addEventListener('mousemove',e=>{if(!resizing)return;const nw=Math.max(160,Math.min(rw+(e.clientX-rx),600));const nh=Math.max(120,Math.min(rh+(e.clientY-ry),450));float.style.width=nw+'px';float.style.height=nh+'px';float.removeAttribute('data-size')});
        document.addEventListener('mouseup',()=>{resizing=false});

        // Size buttons
        UI.refs.btnResizeSm?.addEventListener('click',()=>float.setAttribute('data-size','sm'));
        UI.refs.btnResizeMd?.addEventListener('click',()=>{float.setAttribute('data-size','md');float.style.left='';float.style.top='';float.style.width='';float.style.height=''});
        UI.refs.btnResizeLg?.addEventListener('click',()=>float.setAttribute('data-size','lg'));
    }

    // ── Media ─────────────────────────────────────────────────────
    let _facingMode='environment'; // default rear camera
    async function requestMedia(){try{_mediaStream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:_facingMode},audio:{sampleRate:16000,channelCount:1,echoCancellation:true,noiseSuppression:true}});UI.refs.cameraPreview.srcObject=_mediaStream;UI.hidePlaceholder();return true}catch(e){if(_facingMode==='environment'){_facingMode='user';return await requestMedia()}UI.addErrorMessage(e.name==='NotAllowedError'?'权限被拒绝':e.name==='NotFoundError'?'未检测到摄像头':'摄像头访问失败');return false}}
    function stopMedia(){if(_mediaStream){_mediaStream.getTracks().forEach(t=>t.stop());_mediaStream=null}UI.refs.cameraPreview.srcObject=null;UI.showPlaceholder()}

    // ── WS handler ────────────────────────────────────────────────
    function handleWsMessage(type,payload){switch(type){case'user_speech':UI.addUserSpeech('🗣 '+payload.text);break;case'status':UI.setStatus(payload.state);_muted=(payload.state==='speaking'||payload.state==='thinking');UI.showInterrupt(payload.state==='speaking'||payload.state==='thinking');if(payload.state==='thinking')UI.showTyping();if(payload.state==='listening'){Cost.startAudio();UI.removeTyping()}else Cost.stopAudio();updateCost();break;case'text_delta':UI.removeTyping();UI.appendAiText(payload.text||'');Cost.textOutChars+=(payload.text||'').length;if(UI.isSubtitleEnabled()){_subtitleText+=payload.text||'';UI.setSubtitle(_subtitleText)}break;case'text_done':UI.finishAiBubble();_subtitleText='';chime();updateCost();break;case'audio_delta':UI.removeTyping();Cost.audioOutChars+=Math.round((payload.data||'').length*.25);if(UI.isAudioEnabled())_audioOut.addChunk(payload.data||'');break;case'audio_done':UI.showInterrupt(false);if(UI.isAudioEnabled()&&_audioOut.bufferLength>0)_audioOut.play();updateCost();break;case'error':UI.addErrorMessage(payload.message||'AI错误');UI.setStatus('error');UI.showInterrupt(false);UI.removeTyping();break}}

    function interrupt(){if(_ws?.isConnected)_ws.send({type:'cancel'});UI.showInterrupt(false);UI.addSystemMessage('已打断')}

    // ── Start / Stop ──────────────────────────────────────────────
    async function start(){if(_state===State.RUNNING)return;_state=State.STARTING;UI.setStatus('connecting');Cost.reset();updateCost();if(!await requestMedia()){_state=State.ERROR;UI.setStatus('error');UI.setButtons(true,false);return}_ws=new WsClient();_ws.onMessage=handleWsMessage;_ws.connect();_audioOut=AudioPlayback;await AudioCapture.start(_mediaStream);AudioCapture.onChunk=b64=>{if(!_muted&&_ws?.isConnected)_ws.send({type:'audio',data:b64})};AudioCapture.onLevel=l=>{UI.setMeterLevel(l);drawWaveform(l)};VideoCapture.start(UI.refs.cameraPreview,UI.refs.captureCanvas);VideoCapture.onFrame=b64=>{if(_cameraOn&&_ws?.isConnected){_ws.send({type:'video',data:b64});Cost.videoFrames++}};UI.refs.quickAsks.style.display='flex';setTimeout(()=>{if(_ws?.isConnected)_ws.send({type:'start_session',instructions:getInstructions()})},600);_state=State.RUNNING;UI.setStatus('listening');UI.setButtons(false,true);UI.refs.btnCamera.disabled=false;if(UI.refs.btnSwitchCam)UI.refs.btnSwitchCam.disabled=false;UI.showWelcome()}
    async function stop(){Cost.stopAudio();Cost.reset();updateCost();AudioCapture.stop();VideoCapture.stop();_audioOut.destroy();if(_ws){_ws.send({type:'end_session'});_ws.disconnect();_ws=null}stopMedia();UI.showInterrupt(false);UI.refs.quickAsks.style.display='none';_state=State.IDLE;_cameraOn=true;_subtitleText='';UI.setStatus('idle');UI.setButtons(true,false);UI.clearSubtitle()}
    function toggleCamera(){_cameraOn=!_cameraOn;if(_mediaStream){const vt=_mediaStream.getVideoTracks()[0];if(vt)vt.enabled=_cameraOn}const b=UI.refs.btnCamera;if(_cameraOn){b.classList.remove('off');b.title='关闭摄像头'}else{b.classList.add('off');b.title='打开摄像头'}}
    async function switchCamera(){_facingMode=_facingMode==='user'?'environment':'user';if(_mediaStream){_mediaStream.getVideoTracks().forEach(t=>t.stop());const newStream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:_facingMode},audio:false});const vt=newStream.getVideoTracks()[0];const at=_mediaStream.getAudioTracks();_mediaStream=newStream;at.forEach(t=>_mediaStream.addTrack(t));UI.refs.cameraPreview.srcObject=_mediaStream;if(!_cameraOn)vt.enabled=false}UI.addSystemMessage(_facingMode==='environment'?'已切换后置摄像头':'已切换前置摄像头')}

    // ── Init ──────────────────────────────────────────────────────
    let _deviceMode='desktop';
    function init(){
        // Mode toggle
        UI.refs.modeOptions?.addEventListener('click',e=>{
            const btn=e.target.closest('.mode-btn');if(!btn)return;
            UI.refs.modeOptions.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');_deviceMode=btn.dataset.mode;
            UI.refs.app?.setAttribute('data-mode',_deviceMode);
        });
        UI.refs.roleOptions.addEventListener('click',e=>{const btn=e.target.closest('.role-btn');if(!btn)return;UI.refs.roleOptions.querySelectorAll('.role-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');_selectedRole=btn.dataset.role});
        UI.refs.quickAsks.addEventListener('click',e=>{const btn=e.target.closest('.quick-btn');if(!btn||_state!==State.RUNNING)return;UI.addUserSpeech('💡 试试说: '+btn.dataset.q)});
        UI.refs.btnEnter.addEventListener('click',()=>{UI.showConversation();start()});
        UI.refs.btnBack.addEventListener('click',()=>{stop();UI.showLanding()});
        UI.refs.btnStart.addEventListener('click',start);
        UI.refs.btnStop.addEventListener('click',stop);
        UI.refs.btnCamera.addEventListener('click',toggleCamera);
        UI.refs.btnSwitchCam?.addEventListener('click',switchCamera);
        UI.refs.interruptBtn.addEventListener('click',interrupt);
        initDragResize();
        initParticles();
        UI.setButtons(true,false);UI.setStatus('idle');
        UI.onAudioToggle(()=>UI.setCostHint(UI.isAudioEnabled()?'语音播报开启':'纯文字模式'));
        UI.setCostHint('语音播报开启');UI.setCostDisplay('');
    }
    return{init};
})();
document.addEventListener('DOMContentLoaded',()=>App.init());
