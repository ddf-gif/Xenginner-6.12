/**
 * LENS — AI Visual Dialogue.
 * Features: adaptive fps, voice interrupt, cost, PWA, transcription,
 *           role switching, quick questions, particles, HUD, waveform, chime.
 */
const App = (() => {
    const State = { IDLE:'idle',STARTING:'starting',RUNNING:'running',ERROR:'error' };
    let _state = State.IDLE, _mediaStream = null, _ws = null, _audioOut = null;
    let _muted = false, _cameraOn = true, _subtitleText = '';
    let _selectedRole = 'assistant';

    // ── Role system ──────────────────────────────────────────────────
    const ROLES = {
        assistant:   '你是AI视觉助手，请用中文简洁回答用户的问题。',
        teacher:     '你是一位耐心的英语老师。用户用中文提问时，你用英文回答并附中文解释。',
        interviewer:'你是一位专业的面试官。针对用户的表现给出建设性反馈，中英文皆可。',
        friend:     '你是用户的好朋友，聊天风格随意幽默，多用表情和口语。',
    };
    function getInstructions() { return ROLES[_selectedRole] || ROLES.assistant; }

    // ── Cost tracking ────────────────────────────────────────────────
    const Cost = {
        audioInSec:0, videoFrames:0, textOutChars:0, audioOutChars:0, _timer:null,
        startAudio(){ if(!this._timer) this._timer=setInterval(()=>{this.audioInSec+=0.1},100); },
        stopAudio(){ clearInterval(this._timer); this._timer=null; },
        reset(){ this.stopAudio(); this.audioInSec=0; this.videoFrames=0; this.textOutChars=0; this.audioOutChars=0; },
        estimate(){
            const c = (this.audioInSec*800*18.9 + this.audioOutChars*3*75.1 +
                       this.textOutChars*2*8.3 + this.videoFrames*200*8.3)/1e6;
            return c;
        },
        format(){ const c=this.estimate(); if(c<1e-3)return'¥0.000'; if(c<0.01)return'¥'+c.toFixed(4); return'¥'+c.toFixed(3); },
    };
    function updateCost(){ UI.setCostDisplay(Cost.format()); }

    // ── Particle system ──────────────────────────────────────────────
    let _particles = [];
    function initParticles() {
        const c = UI.refs.particles;
        if (!c) return;
        c.width = window.innerWidth; c.height = window.innerHeight;
        const ctx = c.getContext('2d');
        _particles = Array.from({length:50},()=>({
            x:Math.random()*c.width, y:Math.random()*c.height,
            r:Math.random()*1.2+0.3, vx:(Math.random()-0.5)*0.3, vy:(Math.random()-0.5)*0.3,
        }));
        function draw(){
            if (!c.isConnected) return;
            ctx.clearRect(0,0,c.width,c.height);
            _particles.forEach(p=>{
                p.x+=p.vx; p.y+=p.vy;
                if(p.x<0)p.x=c.width; if(p.x>c.width)p.x=0;
                if(p.y<0)p.y=c.height; if(p.y>c.height)p.y=0;
                ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
                ctx.fillStyle='oklch(0.58 0.18 31 / 0.15)'; ctx.fill();
            });
            requestAnimationFrame(draw);
        }
        draw();
    }

    // ── Waveform ─────────────────────────────────────────────────────
    let _waveHistory = new Array(60).fill(0);
    function drawWaveform(level) {
        const c = UI.refs.waveform;
        if (!c || !c.isConnected) return;
        const ctx = c.getContext('2d');
        const w=c.width=c.offsetWidth, h=c.height=c.offsetHeight;
        _waveHistory.push(Math.min(level*3,1));
        if (_waveHistory.length>60) _waveHistory.shift();
        ctx.clearRect(0,0,w,h);
        ctx.strokeStyle='oklch(0.58 0.18 31 / 0.5)'; ctx.lineWidth=1.5;
        ctx.beginPath();
        const barW=w/60;
        _waveHistory.forEach((v,i)=>{
            const x=i*barW, bh=v*h*0.8, by=(h-bh)/2;
            ctx.fillStyle='oklch(0.58 0.18 31 / 0.35)';
            ctx.fillRect(x,by,barW-1,bh||1);
        });
    }

    // ── Chime sound ──────────────────────────────────────────────────
    function playChime() {
        try {
            const ac=new (window.AudioContext||window.webkitAudioContext)();
            if(ac.state==='suspended') ac.resume();
            [800,1000].forEach((freq,i)=>{
                const o=ac.createOscillator(), g=ac.createGain();
                o.type='sine'; o.frequency.value=freq;
                g.gain.setValueAtTime(0.08,ac.currentTime+i*0.08);
                g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+i*0.08+0.2);
                o.connect(g); g.connect(ac.destination);
                o.start(ac.currentTime+i*0.08); o.stop(ac.currentTime+i*0.08+0.25);
            });
        }catch(e){}
    }

    // ── Media ───────────────────────────────────────────────────────
    async function requestMedia() {
        try {
            _mediaStream = await navigator.mediaDevices.getUserMedia({
                video:{width:{ideal:1280},height:{ideal:720},facingMode:'user'},
                audio:{sampleRate:16000,channelCount:1,echoCancellation:true,noiseSuppression:true},
            });
            UI.refs.cameraPreview.srcObject=_mediaStream;
            UI.hidePlaceholder();
            return true;
        }catch(e){
            UI.addErrorMessage(e.name==='NotAllowedError'?'摄像头/麦克风权限被拒绝':e.name==='NotFoundError'?'未检测到设备':'设备访问失败:'+e.message);
            return false;
        }
    }
    function stopMedia(){
        if(_mediaStream){_mediaStream.getTracks().forEach(t=>t.stop());_mediaStream=null;}
        UI.refs.cameraPreview.srcObject=null;
        UI.showPlaceholder();
    }

    // ── Interrupt ────────────────────────────────────────────────────
    function interrupt(){if(_ws?.isConnected)_ws.send({type:'cancel'}); UI.showInterrupt(false); UI.addSystemMessage('⏹ 已打断');}

    // ── WS handler ──────────────────────────────────────────────────
    function handleWsMessage(type,payload){
        switch(type){
        case 'user_speech':
            UI.addUserSpeech('🗣 '+payload.text);
            break;
        case 'status':
            UI.setStatus(payload.state);
            _muted=(payload.state==='speaking'||payload.state==='thinking');
            UI.showInterrupt(payload.state==='speaking'||payload.state==='thinking');
            if(payload.state==='listening')Cost.startAudio();else Cost.stopAudio();
            updateCost();
            break;
        case 'text_delta':
            UI.appendAiText(payload.text||'');
            Cost.textOutChars+=(payload.text||'').length;
            if(UI.isSubtitleEnabled()){_subtitleText+=payload.text||'';UI.setSubtitle(_subtitleText);}
            break;
        case 'text_done':
            UI.finishAiBubble(); _subtitleText='';
            playChime();
            updateCost();
            break;
        case 'audio_delta':
            Cost.audioOutChars+=Math.round((payload.data||'').length*0.25);
            if(UI.isAudioEnabled())_audioOut.addChunk(payload.data||'');
            break;
        case 'audio_done':
            UI.showInterrupt(false);
            if(UI.isAudioEnabled()&&_audioOut.bufferLength>0)_audioOut.play();
            updateCost();
            break;
        case 'error':
            UI.addErrorMessage(payload.message||'AI 服务错误');
            UI.setStatus('error'); UI.showInterrupt(false);
            break;
        }
    }

    // ── Quick ask ────────────────────────────────────────────────────
    function quickAsk(question) {
        UI.addUserSpeech('💡 试试说: '+question);
    }

    // ── Start / Stop ────────────────────────────────────────────────
    async function start(){
        if(_state===State.RUNNING)return;
        _state=State.STARTING; UI.setStatus('connecting'); Cost.reset(); updateCost();
        if(!await requestMedia()){_state=State.ERROR; UI.setStatus('error'); UI.setButtons(true,false); return;}

        _ws=new WsClient(); _ws.onMessage=handleWsMessage; _ws.connect();
        _audioOut=AudioPlayback;

        await AudioCapture.start(_mediaStream);
        AudioCapture.onChunk=b64=>{if(!_muted&&_ws?.isConnected)_ws.send({type:'audio',data:b64});};
        AudioCapture.onLevel=l=>{UI.setMeterLevel(l); drawWaveform(l);};

        VideoCapture.start(UI.refs.cameraPreview,UI.refs.captureCanvas);
        VideoCapture.onFrame=b64=>{if(_cameraOn&&_ws?.isConnected){_ws.send({type:'video',data:b64});Cost.videoFrames++;}};

        // Show quick questions
        UI.refs.quickAsks.style.display='flex';

        setTimeout(()=>{if(_ws?.isConnected)_ws.send({type:'start_session',instructions:getInstructions()});},600);

        _state=State.RUNNING; UI.setStatus('listening'); UI.setButtons(false,true);
        UI.refs.btnCamera.disabled=false;
        UI.addSystemMessage('已连接。快速提问或直接说话。AI 说话时可点击打断。');
    }

    async function stop(){
        Cost.stopAudio(); Cost.reset(); updateCost();
        AudioCapture.stop(); VideoCapture.stop(); _audioOut.destroy();
        if(_ws){_ws.send({type:'end_session'});_ws.disconnect();_ws=null;}
        stopMedia(); UI.showInterrupt(false);
        UI.refs.quickAsks.style.display='none';
        _state=State.IDLE; _cameraOn=true; _subtitleText='';
        UI.setStatus('idle'); UI.setButtons(true,false); UI.clearSubtitle();
    }

    function toggleCamera(){
        _cameraOn=!_cameraOn;
        if(_mediaStream){const vt=_mediaStream.getVideoTracks()[0];if(vt)vt.enabled=_cameraOn;}
        const b=UI.refs.btnCamera;
        if(_cameraOn){b.textContent='摄像头';b.classList.remove('off');}
        else{b.textContent='已关闭';b.classList.add('off');}
    }

    // ── Init ────────────────────────────────────────────────────────
    function init(){
        // Role selector
        UI.refs.roleOptions.addEventListener('click',e=>{
            const btn=e.target.closest('.role-btn');
            if(!btn)return;
            UI.refs.roleOptions.querySelectorAll('.role-btn').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
            _selectedRole=btn.dataset.role;
        });

        // Quick questions
        UI.refs.quickAsks.addEventListener('click',e=>{
            const btn=e.target.closest('.quick-btn');
            if(!btn||_state!==State.RUNNING)return;
            quickAsk(btn.dataset.q);
        });

        UI.refs.btnEnter.addEventListener('click',()=>{UI.showConversation();start();});
        UI.refs.btnBack.addEventListener('click',()=>{stop();UI.showLanding();});
        UI.refs.btnStart.addEventListener('click',start);
        UI.refs.btnStop.addEventListener('click',stop);
        UI.refs.btnCamera.addEventListener('click',toggleCamera);
        UI.refs.interruptBtn.addEventListener('click',interrupt);
        UI.setButtons(true,false); UI.setStatus('idle');
        UI.onAudioToggle(()=>UI.setCostHint(UI.isAudioEnabled()?'语音播报开启':'纯文字模式'));
        UI.setCostHint('语音播报开启'); UI.setCostDisplay('');

        // Particles
        initParticles();

        console.log('🚀 LENS ready');
    }

    return {init};
})();

document.addEventListener('DOMContentLoaded',()=>App.init());
