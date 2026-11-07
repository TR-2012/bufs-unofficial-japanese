// 앱이 window에 붙이는 전역 이름(타입 점검용 선언). 새 전역을 만들면 여기에도 적는다.
interface Window {
  __bip?: any;                          // pwa.js: 설치 이벤트 보관
  toJaOnly: (text: string) => string;   // tts.js
  harukoVoiceKey: (text: string) => string;
  harukoSpeak: (text: string, opts?: { ephemeral?: boolean }) => Promise<boolean>;
  TJCombo: any;                         // combo_check.js
}
