/* ===== 하루코 TTS layer =====
   호출 우선순위:
     0) 미리 만든 음성 파일 audio/<key>.mp3 — VOICEVOX:春日部つむぎ (단어·한자·문법 예문, 무료·무제한)
     1) 파일이 없을 때 브라우저 SpeechSynthesis의 일본어 여성 음성(「Google 日本語」 우선) */
(function(){
  var audioEl=null;
  var inflight=null; // 마지막 재생 중인 AbortController
  var cache=new Map(); // text → blob URL (세션 내)

  // ── 영구 캐시(IndexedDB): 같은 단어/한자 발음을 세션을 넘어 재사용 → TTS 재호출(과금) 방지
  var IDB_NAME='hh-tts-google', IDB_STORE='clips', _idb=null;
  function idbOpen(){
    if(_idb) return Promise.resolve(_idb);
    return new Promise(function(res,rej){
      try{
        if(!window.indexedDB){ rej(); return; }
        var rq=indexedDB.open(IDB_NAME,1);
        rq.onupgradeneeded=function(){ try{ rq.result.createObjectStore(IDB_STORE); }catch(e){} };
        rq.onsuccess=function(){ _idb=rq.result; res(_idb); };
        rq.onerror=function(){ rej(rq.error); };
      }catch(e){ rej(e); }
    });
  }
  function idbGet(key){
    return idbOpen().then(function(db){ return new Promise(function(res){
      try{ var rq=db.transaction(IDB_STORE,'readonly').objectStore(IDB_STORE).get(key);
        rq.onsuccess=function(){ res(rq.result||null); }; rq.onerror=function(){ res(null); };
      }catch(e){ res(null); }
    }); }).catch(function(){ return null; });
  }
  function idbPut(key,blob){
    return idbOpen().then(function(db){ return new Promise(function(res){
      try{ var tx=db.transaction(IDB_STORE,'readwrite'); tx.objectStore(IDB_STORE).put(blob,key);
        tx.oncomplete=function(){ res(true); }; tx.onerror=function(){ res(false); };
      }catch(e){ res(false); }
    }); }).catch(function(){ return false; });
  }

  // 모바일(iOS Safari 등)은 네트워크 대기 후의 play()를 자동재생으로 보고 차단한다.
  // 버튼 클릭 직후(사용자 제스처 안에서) 무음 재생으로 오디오 요소를 미리 '잠금 해제'해 둔다.
  var SILENT='data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7pyn3Xf//WreyTRUoAWgBgkOAGbZHBgG1OF6zM82DWbZaUmMBptgQhGjsyYqc9ae9XFz280948NMBWInljyzsNRFLPWdnZGWrddDsjK1unuSrVN9jJsK8KuQtQCtMBjCEtImISdNKJOopIpBFpNSMbIHCSRpRR5iakjTiyzLhchUUBwCgyKiweBv/7UsQbg8isVNoMPMjAAAA0gAAABEVFGmgqK////9bP/6XCykxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';
  var _unlocked=false;
  function unlockAudio(){
    if(_unlocked) return;
    try{
      var a=ensureAudio();
      a.src=SILENT;
      var p=a.play();
      if(p&&p.then) p.then(function(){ _unlocked=true; },function(){});
    }catch(e){}
  }
  try{
    ['pointerdown','touchend','click','keydown'].forEach(function(ev){
      document.addEventListener(ev, unlockAudio, {capture:true, passive:true});
    });
  }catch(e){}
  function ensureAudio(){
    if(!audioEl){ audioEl=new Audio(); audioEl.preload='auto'; }
    return audioEl;
  }
  function stop(){
    try{ if(audioEl){ audioEl.pause(); audioEl.currentTime=0; } }catch(e){}
    try{ if(inflight) inflight.abort(); }catch(e){}
    try{ if(window.speechSynthesis) window.speechSynthesis.cancel(); }catch(e){}
  }

  async function playBlob(url){
    var a=ensureAudio();
    a.src=url;
    try{ await a.play(); }catch(e){ return false; }
    // 재생이 끝날 때까지 기다린다(「하루코가 말하는 중…」 표시 유지)
    await new Promise(function(res){ a.onended=res; a.onpause=res; a.onerror=res; });
    return true;
  }

  // 브라우저 폴백: 일본어 여성 음성 우선순위 — Google 日本語 → Kyoko/Nanami/Haruka 등 → 아무 ja-JP
  var FEMALE_HINT=/Google 日本語|Kyoko|O-ren|Nanami|Haruka|Ayumi|Mizuki|Sayaka|Female|女性/i;
  function pickVoice(){
    try{
      var vs=(window.speechSynthesis&&speechSynthesis.getVoices())||[];
      var ja=vs.filter(function(v){ return /^ja([-_]|$)/i.test(v.lang); });
      return ja.find(function(v){ return /Google 日本語/.test(v.name); })
        || ja.find(function(v){ return FEMALE_HINT.test(v.name); })
        || ja[0] || null;
    }catch(e){ return null; }
  }
  try{ if(window.speechSynthesis){ speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged=function(){ speechSynthesis.getVoices(); }; } }catch(e){}
  function browserSpeak(text){
    return new Promise(function(res){
      try{
        if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){ res(false); return; }
        var u=new SpeechSynthesisUtterance(text);
        u.lang='ja-JP'; u.rate=0.95; u.pitch=1.1;
        var v=pickVoice(); if(v) u.voice=v;
        u.onend=function(){ res(true); }; u.onerror=function(){ res(false); };
        speechSynthesis.cancel(); speechSynthesis.speak(u);
      }catch(e){ res(false); }
    });
  }

  // 일본어 TTS 입력 정리 — 하루코 목소리는 일본어로만, 1회만 읽도록.
  // ① 괄호 주석(후리가나 가나·로마자·한글 번역) 전체 삭제. 예) "今日(きょう)" → "今日"
  // ② 남은 한글 문자 직접 제거.
  function toJaOnly(s){
    if(!s) return '';
    s=String(s);
    s=s.replace(/\s*[（(][\s぀-ヿーA-Za-z0-9가-힯ᄀ-ᇿ㄰-㆏・.,'’\-]*[)）]\s*/g,'');
    s=s.replace(/[가-힣ᄀ-ᇿ㄰-㆏]/g,'');
    s=s.replace(/\s+/g,' ').trim();
    return s;
  }
  window.toJaOnly = toJaOnly;

  // 미리 만든 음성 파일 이름: toJaOnly(text)의 FNV-1a 32bit 두 개(시드 다름)를 이은 16자리 hex.
  // scripts/build_voice.mjs가 이 함수를 그대로 불러 파일 이름을 만든다(한 곳에서만 정의).
  function voiceKey(text){
    function fnv(str, seed){ var h=seed>>>0; for(var i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619)>>>0; } return ('0000000'+h.toString(16)).slice(-8); }
    return fnv(text,2166136261)+fnv(text,374761393);
  }
  window.harukoVoiceKey = function(text){ return voiceKey(toJaOnly(text)); };
  var staticMiss={}; // 이 세션에서 404였던 키(재요청 방지)
  async function tryStatic(text, signal){
    var k=voiceKey(text);
    if(staticMiss[k]) return null;
    try{
      var r=await fetch('audio/'+k.slice(0,2)+'/'+k+'.mp3',{signal:signal});
      if(!r.ok){ staticMiss[k]=1; return null; }
      var b=await r.blob();
      return (b&&b.size>200)?b:null;
    }catch(e){ return null; }
  }

  window.harukoSpeak = async function(text, opts){
    text=toJaOnly(text);
    if(!text) return false;
    opts=opts||{};
    var ck='v2|'+text; // v2: つむぎ 정적 파일 도입(이전 캐시와 분리)
    stop();
    inflight=new AbortController();
    var sig=inflight.signal;
    if(cache.has(ck)){ var ok=await playBlob(cache.get(ck)); if(ok) return true; cache.delete(ck); }
    // ephemeral(매번 고유한 문장)은 영구 캐시를 건너뜀.
    var ephemeral=!!opts.ephemeral;
    if(!ephemeral){
      var cached=await idbGet(ck);
      if(cached){ var u2=URL.createObjectURL(cached); cache.set(ck,u2); var ok2=await playBlob(u2); if(ok2) return true; }
    }
    var blob=null;
    var fromStatic=false;
    if(!ephemeral){ blob=await tryStatic(text, sig); fromStatic=!!blob; }   // ephemeral 문장은 미리 만든 파일이 없으므로 건너뜀
    if(sig.aborted) return false;
    if(blob){
      var url=URL.createObjectURL(blob);
      cache.set(ck,url);
      if(!ephemeral && !fromStatic) idbPut(ck, blob); // 정적 파일은 브라우저 HTTP 캐시가 맡음
      var played=await playBlob(url);
      if(played) return true;
    }
    if(sig.aborted) return false;
    return await browserSpeak(text);
  };
})();
