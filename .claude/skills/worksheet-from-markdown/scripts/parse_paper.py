#!/usr/bin/env python3
"""Markdown mock paper (+ optional PDF) -> worksheet upload JSON, with the structural checks.

usage: parse_paper.py PAPER.md OUT.json [--pdf PAPER.pdf] [--time MIN] [--mode screen|paper] [--week N] [--date YYYY-MM-DD]

Prints a report. Exit code 1 when a check fails (the JSON is still written so it can be inspected).
Stdlib only; the PDF check needs `pdftotext` (poppler) and is skipped with a warning when it is missing.
"""
import argparse
import json
import re
import shutil
import subprocess
import sys


def read_paper(text):
    head, _, rest = text.partition('## Section')
    rest = '## Section' + rest
    body, _, key_txt = rest.partition('## Answer key')
    header = {'title': (re.match(r'#\s*(.+)', head) or [None, ''])[1].strip()}
    m = re.search(r'Time:\s*(\d+)\s*min', head)
    header['time'] = int(m.group(1)) if m else None
    m = re.search(r'Total marks:\s*(\d+)', head)
    header['marks'] = int(m.group(1)) if m else None
    m = re.search(r'(\d+)\s*questions', head)
    header['count'] = int(m.group(1)) if m else None
    key = {int(q): a for q, a in re.findall(r'\|\s*(\d+)\s*\|\s*([A-D])\s*(?=\|)', key_txt)}
    sections = [(m.start(), m.group(1), int(m.group(2))) for m in re.finditer(r'## Section (\w+):[^\n]*?\((\d+) marks? each\)', body)]
    qs = []
    for m in re.finditer(r'\*\*(\d+)\.\*\* (.*?)\n\n(\(A\).*?)(?=\n\n|\Z)', body, re.S):
        n = int(m.group(1))
        sec = [s for s in sections if s[0] < m.start()][-1]
        opts = [o.strip() for o in re.split(r'\s*\(([A-D])\)\s*', m.group(3))[2::2]]
        qs.append({'n': n, 'q': re.sub(r'\s*\n\s*', ' ', m.group(2).strip()), 'o': opts, 'sec': sec[1], 'marks': sec[2]})
    return header, qs, key


def build(header, qs, key, args):
    marks = sorted({q['marks'] for q in qs})
    use_marks = all(m in (1, 2, 3) for m in marks)  # a mark value doubles as the difficulty when it fits 1..3
    dmap = {m: (m if use_marks else min(i + 1, 3)) for i, m in enumerate(marks)}
    questions = []
    for q in qs:
        a = 'ABCD'.index(key[q['n']]) if q['n'] in key else None
        questions.append({'q': q['q'], 'o': q['o'], 'a': a, 't': f"Mock {q['sec']}", 'd': dmap[q['marks']]})
    table = {str(d): m for m, d in dmap.items()}
    ws = {'title': header['title'], 'mode': args.mode, 'time_limit_min': args.time or header['time'], 'week': args.week, 'set_date': args.date, 'runs_table': table}
    return {'worksheet': ws, 'questions': questions}, marks


def checks(header, qs, key, out, pdf, args):
    bad, warn = [], []
    nums = [q['n'] for q in qs]
    if nums != list(range(1, len(nums) + 1)):
        bad.append(f'question numbers are not 1..{len(nums)} in order: {nums}')
    if header['count'] and header['count'] != len(qs):
        bad.append(f"header says {header['count']} questions, found {len(qs)}")
    for q in qs:
        if len(q['o']) != 4:
            bad.append(f"Q{q['n']}: {len(q['o'])} options, need 4")
        if q['n'] not in key:
            bad.append(f"Q{q['n']}: no answer in the key")
    extra = sorted(set(key) - set(nums))
    if extra:
        bad.append(f'answer key has entries for questions that do not exist: {extra}')
    total = sum(q['marks'] for q in qs)
    if header['marks'] and header['marks'] != total:
        bad.append(f"header says {header['marks']} marks, sections add up to {total}")
    if args.time and header['time'] and args.time != header['time']:
        warn.append(f"markdown says {header['time']} min, using --time {args.time}")
    if pdf:
        warn_or_bad = check_pdf(pdf, qs)
        (bad if warn_or_bad[0] else warn).extend(warn_or_bad[1])
    return bad, warn, total


def check_pdf(path, qs):
    nums = [q['n'] for q in qs]
    if not shutil.which('pdftotext'):
        return False, ['pdftotext not installed: PDF not compared with the markdown']
    txt = subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True, check=False).stdout
    # a question starts a line with its number then a dot (the key table and instructions use other shapes)
    found = [int(n) for n in re.findall(r'^\s*(\d{1,3})\.\s+\S', txt, re.M) if 1 <= int(n) <= max(nums)]
    seen = []
    for n in found:
        if n not in seen:
            seen.append(n)
    missing = [n for n in nums if n not in seen]
    if missing:
        return True, [f'PDF: question numbers not found: {missing}']
    order = [n for n in seen if n in nums]
    if order != sorted(order):
        return True, ['PDF: question numbers appear in a different order than the markdown']
    flat = re.sub(r'\s+', '', txt)
    drift = [q['n'] for q in qs if re.sub(r'\s+', '', q['q'])[:30] not in flat]  # first 30 characters of each question
    if drift:
        return False, [f'PDF: question numbers match, but the opening text of Q{drift} was not found (may be maths glyphs; check by eye)']
    return False, [f'PDF: all {len(nums)} questions found in order, opening text matches']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('md')
    ap.add_argument('out')
    ap.add_argument('--pdf')
    ap.add_argument('--time', type=int)
    ap.add_argument('--mode', default='screen', choices=['screen', 'paper'])
    ap.add_argument('--week', type=int, default=None)
    ap.add_argument('--date', default=None)
    args = ap.parse_args()
    header, qs, key = read_paper(open(args.md, encoding='utf8').read())
    out, marks = build(header, qs, key, args)
    json.dump(out, open(args.out, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    bad, warn, total = checks(header, qs, key, out, args.pdf, args)
    mx = sum(out['worksheet']['runs_table'][str(q['d'])] for q in out['questions'])
    print(f"{len(qs)} questions, key covers {len(key)}, marks {total}, max runs {mx}, runs_table {out['worksheet']['runs_table']}")
    for w in warn:
        print('WARN', w)
    for b in bad:
        print('FAIL', b)
    sys.exit(1 if bad else 0)


main()
