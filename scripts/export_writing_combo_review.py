#!/usr/bin/env python3
"""data/writing_combo.json → docs/writing_combo_review.xlsx (일본어 검수용 시트).

검수자가 문제별로 판정(OK/수정필요/삭제)·수정안·코멘트를 적을 수 있게 한다.
    python3 scripts/export_writing_combo_review.py
"""
import json
from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = Path(__file__).resolve().parent.parent
FONT = 'Malgun Gothic'   # 한글·일본어 한자 모두 표시되는 글꼴
data = json.loads((ROOT / 'data/writing_combo.json').read_text(encoding='utf-8'))['combo']

thin = Side(style='thin', color='BFBFBF')
border = Border(left=thin, right=thin, top=thin, bottom=thin)
head_fill = PatternFill('solid', fgColor='3E2F23')
input_fill = PatternFill('solid', fgColor='FFF9DB')      # 검수자가 채우는 칸
verdicts = ['OK', '수정필요', '삭제']

wb = Workbook()
guide = wb.active
guide.title = '안내'

COLS = [  # (헤더, 너비, 검수자 입력 여부)
    ('No.', 6, False), ('제시 단어 (표기 · 읽기 · 뜻)', 30, False), ('문법 조건', 30, False),
    ('모범 답안', 44, False), ('다른 예시', 44, False), ('메모', 34, False),
    ('판정', 11, True), ('수정안 (일본어)', 40, True), ('코멘트', 34, True),
]
sheets = {}
LEVELS = [(k, k.upper()) for k in ('n5', 'n4', 'n3', 'n2', 'n1') if k in data]
for key, title in LEVELS:
    ws = wb.create_sheet(title)
    sheets[key] = ws
    for c, (h, w, inp) in enumerate(COLS, 1):
        cell = ws.cell(row=1, column=c, value=h)
        cell.font = Font(name=FONT, bold=True, color='F2C14E' if not inp else 'FFFFFF', size=11)
        cell.fill = head_fill if not inp else PatternFill('solid', fgColor='C13B3B')
        cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        cell.border = border
        ws.column_dimensions[get_column_letter(c)].width = w
    ws.row_dimensions[1].height = 28
    for i, it in enumerate(data[key], 1):
        words = '\n'.join(f"{w['w']} ({w['r']}) {w['m']}" if w['r'] != w['w'] else f"{w['w']} {w['m']}" for w in it['words'])
        alts = '\n'.join(f'・{a}' for a in it.get('alts', []))
        row = [i, words, it['cond']['t'] if it.get('cond') else '(조건 없음)', it['model'], alts, it.get('note', ''), None, None, None]
        for c, v in enumerate(row, 1):
            cell = ws.cell(row=i + 1, column=c, value=v)
            cell.font = Font(name=FONT, size=11)
            cell.alignment = Alignment(vertical='top', wrap_text=True, horizontal='center' if c in (1, 7) else 'left')
            cell.border = border
            if COLS[c - 1][2]:
                cell.fill = input_fill
        ws.row_dimensions[i + 1].height = 15 * max(len(words.split('\n')), len(alts.split('\n')), 2) + 6
    n = len(data[key]) + 1
    dv = DataValidation(type='list', formula1='"' + ','.join(verdicts) + '"', allow_blank=True)
    dv.error = 'OK / 수정필요 / 삭제 중에서 선택해 주세요.'
    ws.add_data_validation(dv)
    dv.add(f'G2:G{n}')
    ws.freeze_panes = 'D2'
    ws.auto_filter.ref = f'A1:{get_column_letter(len(COLS))}{n}'

# ---- 안내 시트 ----
def put(r, c, v, bold=False, size=11, color='000000', fill=None, wrap=True):
    cell = guide.cell(row=r, column=c, value=v)
    cell.font = Font(name=FONT, bold=bold, size=size, color=color)
    cell.alignment = Alignment(vertical='top', wrap_text=wrap)
    if fill: cell.fill = PatternFill('solid', fgColor=fill)
    return cell

guide.column_dimensions['A'].width = 22
guide.column_dimensions['B'].width = 90
put(1, 1, '단어 조합 작문 — 일본어 검수 시트', True, 15)
put(2, 1, 'BUFS 비공식 일본어 학습 앱의 「작문 연습 → 단어 조합」 문제를 일본어 원어민(또는 상급자)이 확인하기 위한 시트입니다.', size=10, color='595959')
guide.merge_cells('A2:B2')
rows = [
    ('검수 대상', '모범 답안과 다른 예시 문장이 ① 문법적으로 맞는지 ② 자연스러운지 ③ 제시된 단어와 문법 조건을 실제로 쓰고 있는지.'),
    ('작성 방법', 'N3·N2·N1 시트의 노란색 칸(판정 · 수정안 · 코멘트)만 채워 주세요. 판정은 드롭다운에서 고릅니다. 나머지 칸은 수정하지 마세요.'),
    ('판정 기준', 'OK = 그대로 사용 · 수정필요 = 수정안 칸에 고친 일본어를 적어 주세요 · 삭제 = 문제 자체가 부적절(코멘트에 이유).'),
    ('입력 예시', '판정: 수정필요 / 수정안: 「友達との約束は、必ず守っている。」 / 코멘트: 「ようにしている」보다 단정적인 표현이 자연스러움 (예시이며 실제 문제와 무관)'),
    ('참고', '단어 수준은 앱 어휘 데이터(words.json)의 JLPT 라벨 기준으로 각 문제에 해당 등급 단어(N3 이상 / N2·N1 / N1)가 한 개 이상 있고, 나머지는 일상어입니다. 라벨은 공식 출제 목록이 아니라 이 저장소의 학습 목표 분류입니다.'),
    ('반영 방법', '검수 후 이 파일을 돌려주시면 「수정필요」는 수정안으로 교체하고 「삭제」는 제거한 뒤 검사 스크립트(scripts/check-writing-combo.mjs)로 다시 확인합니다.'),
]
for i, (k, v) in enumerate(rows, 4):
    put(i, 1, k, True, fill='F3E9D2'); put(i, 2, v)
    guide.row_dimensions[i].height = 34
r = 4 + len(rows) + 1
put(r, 1, '진행 현황', True, 12)
put(r + 1, 1, '구분', True, fill='F3E9D2'); put(r + 1, 2, '건수', True, fill='F3E9D2')
def _sum(fn):
    return '=' + '+'.join(fn(t, len(data[k]) + 1) for k, t in LEVELS)
labels = [('전체 문제 수', _sum(lambda t, n: f'COUNTA({t}!A2:A{n})'))] + [
    (v, _sum(lambda t, n, v=v: f'COUNTIF({t}!G2:G{n},"{v}")')) for v in ('OK', '수정필요', '삭제')] + [('미검수', None)]
for j, (k, f) in enumerate(labels):
    rr = r + 2 + j
    put(rr, 1, k)
    if f is None:
        f = f'=B{r+2}-B{r+3}-B{r+4}-B{r+5}'
    c = put(rr, 2, f); c.alignment = Alignment(horizontal='left')
put(r + 8, 1, '문제 수는 data/writing_combo.json에서 자동 생성되었습니다 (%s).' % ' · '.join(f'{t} {len(data[k])}' for k, t in LEVELS), size=9, color='7F7F7F')
guide.merge_cells(start_row=r + 8, start_column=1, end_row=r + 8, end_column=2)
guide.sheet_view.showGridLines = False

out = ROOT / 'docs/writing_combo_review.xlsx'
wb.save(out)
print('saved', out, {k: len(v) for k, v in data.items()})
