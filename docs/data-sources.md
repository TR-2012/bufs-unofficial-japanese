# Data Sources

이 문서는 데이터 출처를 쉽게 정리한 안내서입니다.

## 왜 아무 단어장이나 복사하지 않나요?

JLPT 공부 자료는 시중 문제집, 유료 강의, 웹사이트 단어장이 많습니다. 하지만 그런 자료를 그대로 복사하면 저작권 문제가 생길 수 있습니다.

그래서 이 저장소는 아래 원칙을 사용합니다.

1. 공개 라이선스 데이터는 출처와 라이선스를 남기고 사용합니다.
2. 직접 작성한 학습 설명은 이 저장소 안에서 관리합니다.
3. 출처가 불분명한 시험 대비 목록은 넣지 않습니다.

## JMdict

- 용도: 일본어 어휘, 읽기, 품사, 영어 뜻, 분야 태그
- 다운로드 후보: `http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz`
- 보조 다운로드 후보: `https://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz`
- 프로젝트 안내: `https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project`
- 라이선스: Creative Commons Attribution-ShareAlike 4.0

JMdict는 큰 일본어 사전 데이터입니다. 이 저장소에서는 JMdict를 이용해 JLPT N1 만점권 후보 어휘 10,000개와 JPT 990점권 후보 어휘 20,000개를 만들 수 있게 합니다.

단, 여기서 말하는 “후보”는 공식 시험 출제 목록이라는 뜻이 아닙니다. “공부하면 도움이 되는 큰 단어 묶음”이라는 뜻입니다.

## KANJIDIC2

- 용도: 한자, 읽기, 뜻, 획수, 학년, 빈도, 변형 정보
- 다운로드 후보: `http://ftp.edrdg.org/pub/Nihongo/kanjidic2.xml.gz`
- 보조 다운로드 후보: `https://ftp.edrdg.org/pub/Nihongo/kanjidic2.xml.gz`
- 프로젝트 안내: `https://www.edrdg.org/wiki/index.php/KANJIDIC_Project`
- 라이선스: Creative Commons Attribution-ShareAlike 4.0

KANJIDIC2는 13,000자 이상의 일본어 한자 정보를 담고 있습니다. 이 저장소에서는 상용한자 2,136자와 현대 일본어 한자 후보 3,000자를 만들 때 사용합니다.

## 직접 작성한 seed 데이터

`data/seed/` 안의 TSV 파일은 이 저장소에서 직접 시작 데이터로 만든 자료입니다.

- `grammar.tsv`: N5부터 N1까지 문법 포인트
- `business_keigo.tsv`: 비즈니스 일본어와 경어 표현
- `domain_terms.tsv`: 학술/전문 분야 일본어

seed 데이터는 작게 시작합니다. 이후 검수하면서 계속 늘려 갈 수 있습니다.

## JLPT 관련 주의

JLPT 공식 사이트는 2010년 개정 뒤 “단어, 한자, 문법 전체 목록”을 공개하지 않는다고 설명합니다. 그래서 이 저장소는 공식 목록을 주장하지 않습니다.

## 앱 화면에 표시해야 할 안내문

앱에 JMdict 또는 KANJIDIC2에서 온 데이터를 보여줄 때는 “Sources” 또는 “About” 화면에 아래와 비슷한 문구를 넣으세요.

```text
This application uses data derived from JMdict and KANJIDIC2.
JMdict and KANJIDIC2 are provided by the Electronic Dictionary Research and Development Group under the Creative Commons Attribution-ShareAlike Licence (V4.0).
```
