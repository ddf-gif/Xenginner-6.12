/**
 * LENS — AI Visual Dialogue
 * Chat-first layout + floating draggable/resizable camera.
 */
const App = (() => {
    const State={IDLE:'idle',STARTING:'starting',RUNNING:'running',ERROR:'error'};
    let _state=State.IDLE,_mediaStream=null,_ws=null,_audioOut=null;
    let _muted=false,_cameraOn=true,_subtitleText='';
    let _selectedRole='assistant',_selectedModel='qwen',_customKey='',_customUrl='',_sceneContext='';
    const SCENES={cooking:{prompt:'你正在厨房辅助用户烹饪。用户满手是油不方便操作手机。请根据摄像头画面指导用户做菜，告诉用户下一步该放什么调料、火候是否合适。简洁实用。',welcome:'🍳 欢迎进入 **辅助烹饪** 模式！\n\n我是你的 AI 厨神助手 👨‍🍳。你可以把摄像头对准灶台，随时问我"下一步放什么"、"火候够了吗"。完全解放双手，轻松做菜！',mascot:'👨‍🍳'},search:{prompt:'你正在帮用户寻找物品。用户找不到钥匙、钱包、眼镜等日常物品。请仔细观察摄像头画面，告诉用户物品可能在哪里。',welcome:'🔍 欢迎进入 **物品寻找** 模式！\n\n我是你的 AI 寻物侦探 🕵️。找不到钥匙、钱包、眼镜？打开摄像头让我帮你找。告诉我你在找什么，我帮你四处看看。',mascot:'🕵️'},study:{prompt:'你正在辅助用户学习。用户可能会展示白板笔记、书本文字、代码报错等。请帮用户解读内容、总结要点、解答问题。',welcome:'📖 欢迎进入 **学习助手** 模式！\n\n我是你的 AI 学霸伙伴 🦉。白板笔记看不懂？代码报错不会修？摄像头对准，我来帮你解读、总结、解答。',mascot:'🦉'},diy:{prompt:'你正在指导用户进行DIY维修。用户可能在修理电器或组装家具，双手被占用。请根据摄像头画面提供实时指导，帮助辨认零件和步骤。',welcome:'🔧 欢迎进入 **DIY 维修** 模式！\n\n我是你的 AI 维修师傅 🔩。修电器、装家具时双手没空？摄像头照着，我一步步指导你，帮你认零件、看图纸。',mascot:'🔩'},kids:{prompt:'你正在和孩子互动。孩子可能会指着绘本、玩具或其他物品问问题。请用生动有趣、适合儿童的语言回答，富有童心和想象力。',welcome:'👶 欢迎进入 **儿童教育** 模式！\n\n我是你的 AI 故事精灵 🧚。小朋友们，拿起你的绘本或玩具让我看看，我会用有趣的故事告诉你这是什么！',mascot:'🧚'},accessibility:{prompt:'你正在为视障用户提供视觉辅助。请用清晰的语言描述摄像头画面中的环境、物品、文字。帮助用户辨认药品、找到物品、了解周围环境。',welcome:'♿ 欢迎进入 **视觉辅助** 模式！\n\n我是你的 AI 眼睛伙伴 🦮。我会用清晰的语言描述周围环境，帮你认药品、找物品、了解你在哪个房间。放心，我一直在看着。',mascot:'🦮'}};
    const ROLES={assistant:'你是AI视觉助手，请用中文简洁回答用户的问题。',teacher:'你是一位耐心的英语老师。用户用中文提问时，你用英文回答并附中文解释。',interviewer:'你是一位专业的面试官。针对用户的表现给出建设性反馈，帮助用户提升面试技巧。',friend:'你是用户的好朋友，聊天风格随意幽默，多用表情和口语，像跟老友聊天。',travel:'你是一位资深的旅行向导。根据用户展示的场景或问题，推荐目的地、美食和旅行攻略，语言充满画面感。',coach:'你是一位专业的健身教练。根据用户的身体状况和目标给出运动建议、饮食计划和动作指导，语言激励人心。',foodie:'你是一位美食评论家。看到食物画面时给出专业的品鉴意见，用生动的语言描述味道和口感。',tech:'你是一位科技顾问。用通俗易懂的方式解释技术概念，推荐电子产品，解答编程和IT相关问题。',storyteller:'你是一位故事大王。用生动有趣的语言讲故事，可以根据用户看到的画面即兴创作童话或小故事。',listener:'你是一位温暖的心理倾听者。用同理心倾听用户的烦恼，给出温和的反馈和建议，像一位值得信赖的朋友。'};
    function getInstructions(){let base=ROLES[_selectedRole]||ROLES.assistant;if(_sceneContext&&SCENES[_sceneContext]){base=SCENES[_sceneContext].prompt+' '+base}return base}

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
    async function start(){if(_state===State.RUNNING)return;UI.refs.app?.setAttribute("data-mode",_deviceMode||"desktop");_state=State.STARTING;UI.setStatus('connecting');Cost.reset();updateCost();if(!await requestMedia()){_state=State.ERROR;UI.setStatus('error');UI.setButtons(true,false);return}_ws=new WsClient();_ws.onMessage=handleWsMessage;_ws.connect();_audioOut=AudioPlayback;await AudioCapture.start(_mediaStream);AudioCapture.onChunk=b64=>{if(!_muted&&_ws?.isConnected)_ws.send({type:'audio',data:b64})};AudioCapture.onLevel=l=>{UI.setMeterLevel(l);drawWaveform(l)};VideoCapture.start(UI.refs.cameraPreview,UI.refs.captureCanvas);VideoCapture.onFrame=b64=>{if(_cameraOn&&_ws?.isConnected){_ws.send({type:'video',data:b64});Cost.videoFrames++}};UI.refs.quickAsks.style.display='flex';setTimeout(()=>{if(_ws?.isConnected)_ws.send({type:'start_session',instructions:getInstructions(),model:_selectedModel,api_key:_customKey,api_url:_customUrl})},600);_state=State.RUNNING;UI.setStatus('listening');UI.setButtons(false,true);UI.refs.btnCamera.disabled=false;if(UI.refs.btnSwitchCam)UI.refs.btnSwitchCam.disabled=false;UI.showWelcome(_sceneContext&&SCENES[_sceneContext]?SCENES[_sceneContext].welcome:'👋 欢迎使用 AI 视觉助手！\n\n直接说话或点击快捷提问开始。')}
    async function stop(){Cost.stopAudio();Cost.reset();updateCost();AudioCapture.stop();VideoCapture.stop();_audioOut.destroy();if(_ws){_ws.send({type:'end_session'});_ws.disconnect();_ws=null}stopMedia();UI.showInterrupt(false);UI.refs.quickAsks.style.display='none';_state=State.IDLE;_cameraOn=true;_subtitleText='';UI.setStatus('idle');UI.setButtons(true,false);UI.clearSubtitle()}
    function toggleCamera(){_cameraOn=!_cameraOn;if(_mediaStream){const vt=_mediaStream.getVideoTracks()[0];if(vt)vt.enabled=_cameraOn}const b=UI.refs.btnCamera;if(_cameraOn){b.classList.remove('off');b.title='关闭摄像头'}else{b.classList.add('off');b.title='打开摄像头'}}
    async function switchCamera(){_facingMode=_facingMode==='user'?'environment':'user';if(_mediaStream){_mediaStream.getVideoTracks().forEach(t=>t.stop());const newStream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:_facingMode},audio:false});const vt=newStream.getVideoTracks()[0];const at=_mediaStream.getAudioTracks();_mediaStream=newStream;at.forEach(t=>_mediaStream.addTrack(t));UI.refs.cameraPreview.srcObject=_mediaStream;if(!_cameraOn)vt.enabled=false}UI.addSystemMessage(_facingMode==='environment'?'已切换后置摄像头':'已切换前置摄像头')}

    // ── Init ──────────────────────────────────────────────────────
    let _deviceMode='desktop';
    function init(){
        UI.setStopFn(stop);
        // Mode toggle
        UI.refs.modeOptions?.addEventListener('click',e=>{
            const btn=e.target.closest('.mode-btn');if(!btn)return;
            UI.refs.modeOptions.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');_deviceMode=btn.dataset.mode;
            UI.refs.app?.setAttribute('data-mode',_deviceMode);
        });
        // Sync mode from landing to app on enter
        UI.refs.btnEnter.addEventListener('click',()=>{UI.refs.app?.setAttribute('data-mode',_deviceMode||'desktop');_sceneContext='';UI.showConversation();start()});
        UI.refs.roleOptions.addEventListener('click',e=>{const btn=e.target.closest('.role-btn');if(!btn)return;UI.refs.roleOptions.querySelectorAll('.role-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');_selectedRole=btn.dataset.role});
        UI.refs.quickAsks.addEventListener('click',e=>{const btn=e.target.closest('.quick-btn');if(!btn||_state!==State.RUNNING)return;UI.addUserSpeech('💡 试试说: '+btn.dataset.q)});
        // Model selector
        const modelSel=document.getElementById('model-select');
        const modelKey=document.getElementById('model-key');
        const customRow=document.getElementById('custom-url-card');
        const modelUrl=document.getElementById('model-url');
        const statusModel=document.getElementById('status-model');
        const statusKey=document.getElementById('status-key');
        const statusUrl=document.getElementById('status-url');
        const statusRole=document.getElementById('status-role');
        const statusTag=document.getElementById('status-tag');
        if(modelSel){modelSel.addEventListener('change',()=>{_selectedModel=modelSel.value;if(customRow)customRow.style.display=_selectedModel==='custom'?'block':'none';if(statusModel)statusModel.textContent=modelSel.options[modelSel.selectedIndex].text;if(statusUrl)statusUrl.textContent=_selectedModel==='qwen'?'DashScope 官方':_selectedModel==='openai'?'OpenAI API':'自定义端点'});}
        if(modelKey){modelKey.addEventListener('input',()=>{_customKey=modelKey.value;if(statusKey)statusKey.textContent=_customKey?'已设置 ('+_customKey.slice(0,8)+'...)':'使用默认 Key'});}
        if(modelUrl){modelUrl.addEventListener('input',()=>{_customUrl=modelUrl.value;if(statusUrl)statusUrl.textContent=_customUrl||'自定义端点'});}
        // Update status on role click
        document.getElementById('role-options')?.addEventListener('click',()=>{setTimeout(()=>{const a=document.querySelector('#role-options .role-btn.active');if(statusRole&&a)statusRole.textContent=a.textContent},50)});
        // Scene card clicks → start conversation directly with themed UI
        document.getElementById('cascade-cards')?.addEventListener('click',e=>{const card=e.target.closest('.c-card');if(!card)return;_sceneContext=card.dataset.scene||'';UI.refs.app.setAttribute('data-scene',_sceneContext||'default');UI.refs.app.setAttribute('data-mode',_deviceMode||'desktop');UI.showConversation();start()});

        // Reset config button
        document.getElementById('btn-reset-config')?.addEventListener('click',()=>{if(modelSel)modelSel.value='qwen';if(modelKey)modelKey.value='';if(modelUrl)modelUrl.value='';_selectedModel='qwen';_customKey='';_customUrl='';if(customRow)customRow.style.display='none';if(statusModel)statusModel.textContent='Qwen Omni Flash';if(statusKey)statusKey.textContent='服务器默认';if(statusUrl)statusUrl.textContent='DashScope 官方';if(statusTag)statusTag.textContent='已重置'});

        // Page navigation
        // (btnEnter handler merged with mode sync above)
        UI.refs.btnBack.addEventListener('click',()=>{stop();UI.showLanding()});
        // Settings page
        const btnToSettings=document.getElementById('btn-to-settings');
        const btnSettingsBack=document.getElementById('btn-settings-back');
        if(btnToSettings)btnToSettings.addEventListener('click',()=>UI.showSettings());
        if(btnSettingsBack)btnSettingsBack.addEventListener('click',()=>UI.showLanding());
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
