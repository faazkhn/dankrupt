"""Generates index.html for the Dankrupt Devpost demo from the word timings. Run from the project root."""
import json, html

words = json.load(open("assets/audio/transcript.json"))
words = words if isinstance(words, list) else words["words"]
FIX = {"10": "Ten", "skibitty": "Skibidi", "toilet,": "Toilet,", "hold.": "hold?", "shot": "short", "3": "three", "flare.": "flair."}
for i, w in enumerate(words):
    t = w["text"]
    if t in FIX:
        w["text"] = FIX[t]
    if t == "you" and i < 8:  # the take says "you are"; the script says "You're"
        w["text"] = "You're"; w["end"] = words[i + 1]["end"]; words[i + 1]["text"] = ""
words = [w for w in words if w["text"]]
DUR = 52.0

# ---------- caption groups: 2-3 words, break on punctuation or a 150 ms pause ----------
groups, cur = [], []
for i, w in enumerate(words):
    cur.append(w)
    nxt = words[i + 1] if i + 1 < len(words) else None
    end_punct = w["text"][-1] in ".,?!"
    if len(cur) == 3 or end_punct or not nxt or nxt["start"] - w["end"] >= 0.15:
        groups.append(cur); cur = []
CAP_HTML, CAP_JS = [], []
for gi, g in enumerate(groups):
    s = max(0.1, g[0]["start"] - 0.05)
    e = (groups[gi + 1][0]["start"] - 0.05) if gi + 1 < len(groups) else g[-1]["end"] + 0.4
    e = min(e, g[-1]["end"] + 0.6)
    spans = "".join(f'<span id="cw{gi}_{k}" class="w">{html.escape(w["text"])}</span> ' for k, w in enumerate(g))
    CAP_HTML.append(f'<div id="cap{gi}" class="clip cap" data-start="{s:.2f}" data-duration="{e - s:.2f}" data-track-index="9"><div class="capin">{spans.strip()}</div></div>')
    for k, w in enumerate(g):
        CAP_JS.append(f'tl.fromTo("#cw{gi}_{k}",{{scale:.6,opacity:0}},{{scale:1,opacity:1,duration:.12,ease:"back.out(2)"}},{max(s, w["start"] - 0.04):.2f});')
        CAP_JS.append(f'tl.to("#cw{gi}_{k}",{{color:"#19f26b",duration:.05}},{w["start"]:.2f});tl.to("#cw{gi}_{k}",{{color:"#ffffff",duration:.08}},{w["end"]:.2f});')

# ---------- timed elements ----------
def clip(id_, s, d, inner, cls="", track=2, extra=""):
    return f'<div id="{id_}" class="clip {cls}" data-start="{s}" data-duration="{d}" data-track-index="{track}" {extra}>{inner}</div>'

def video(id_, src, s, d, ms):
    return f'<video id="{id_}" class="clip vid" muted playsinline src="assets/clips/{src}.mp4" data-start="{s}" data-duration="{d}" data-media-start="{ms}" data-track-index="1" style="position:absolute;left:0;top:0;width:406px;height:880px;object-fit:cover"></video>'

M = {n: json.load(open(f"work/rec4/{n}.json")) for n in ["meme", "markets", "buy", "short", "board"]}
VIDEOS = [video("v1", "meme", 0, 6.4, round(M["meme"]["meme"] + 0.7, 2)), video("v2", "splash", 9.4, 3.5, 0.2),
          video("v3", "markets", 17.9, 3.9, round(M["markets"]["scroll"] - 1.0, 2)),
          video("v4", "meme", 21.8, 4.3, round(M["meme"]["meme"] + 1.0, 2)),
          video("v5", "buy", 26.1, 2.7, round(M["buy"]["qty"] - 0.56, 2)), video("v6", "short", 28.8, 3.6, round(M["short"]["submit"] - 2.9, 2)),
          video("v7", "result", 36.0, 3.4, 0.8), video("v8", "board", 42.4, 4.2, round(M["board"]["board"] + 0.3, 2))]

EL, JS = [], []
def countdown(prefix, start, values, step, big=True):
    for i, v in enumerate(values):
        s = start + i * step
        EL.append(clip(f"{prefix}{i}", round(s, 2), round(step, 2), f'<b id="{prefix}{i}b">{v}</b>', "count", 3))
        JS.append(f'tl.fromTo("#{prefix}{i}b",{{scale:1.18}},{{scale:1,duration:.18,ease:"power3.out"}},{s:.2f});')

# hook
countdown("c", 0.0, [f"00:00:{n:02d}" for n in range(10, 3, -1)], 0.985)
EL.append(clip("tick", 2.8, 4.1, '<div id="tickin" class="sticker up">SKIBIDI TOILET <span>▲ +31%</span></div>', "chip", 4))
JS.append('tl.fromTo("#tickin",{x:-120,opacity:0},{x:0,opacity:1,duration:.32,ease:"back.out(1.6)"},2.8);')
EL.append(clip("soh", 5.55, 1.35, '<div id="sohin"><span id="sell" class="stamp down">SELL</span><span class="or">or</span><span id="hold" class="stamp up">HOLD?</span></div>', "soh", 5))
JS.append('tl.fromTo("#sell",{scale:2.2,opacity:0},{scale:1,opacity:1,duration:.2,ease:"power4.out"},5.6);tl.fromTo("#hold",{scale:2.2,opacity:0},{scale:1,opacity:1,duration:.2,ease:"power4.out"},6.35);')
# rewind
EL.append(clip("rw", 6.9, 2.5, '<div id="rwin"><div id="rwclock">23:59:56</div><div id="rwlabel">◀◀ REWIND</div></div><div class="scan"></div>', "full rw", 6))
JS.append('tl.fromTo("#rwin",{scale:1.25,opacity:0},{scale:1,opacity:1,duration:.15},6.9);')
for i, (t, txt) in enumerate([(7.3, "21:14:03"), (7.6, "17:42:51"), (7.9, "13:06:20"), (8.2, "10:31:44"), (8.5, "08:00:00")]):
    JS.append(f'tl.set("#rwclock",{{textContent:"{txt}"}},{t});')
JS.append('tl.fromTo(".scan",{y:0},{y:-120,duration:2.5,ease:"none"},6.9);')
# morning
EL.append(clip("md", 9.5, 3.4, '<div id="mdin"><div class="kicker">08:00 UTC</div><div class="slam">MARKET<br>DAY #12</div><div id="newpost" class="sticker yellow">NEW POST</div></div>', "left", 4))
JS.append('tl.fromTo("#mdin .slam",{scale:1.8,opacity:0},{scale:1,opacity:1,duration:.22,ease:"power4.out"},9.55);tl.fromTo("#newpost",{scale:0,rotation:-20},{scale:1,rotation:-6,duration:.3,ease:"back.out(2)"},11.45);')
# reveal
EL.append(clip("rev", 12.9, 5.0, '<div id="revin"><img id="logo1" src="assets/img/logo.png" alt="Dankrupt Exchange"><div id="tag">stocks, but they\'re <span>memes</span></div></div>', "full center", 6))
JS.append('tl.fromTo("#logo1",{scale:2.4,opacity:0},{scale:1,opacity:1,duration:.24,ease:"power4.out"},13.3);tl.fromTo("#revin",{x:0},{x:6,duration:.04,repeat:5,yoyo:true},13.54);tl.fromTo("#tag",{y:40,opacity:0},{y:0,opacity:1,duration:.3,ease:"back.out(1.6)"},15.3);')
# coins
EL.append(clip("coins", 17.95, 3.85, '<div id="coinsin"><div class="coinrow"><i class="coin">D</i><b id="cnum">100,000</b></div><div class="sub">fresh wallet, every round</div></div>', "left", 4))
JS.append('tl.fromTo("#coinsin .coinrow",{scale:1.6,opacity:0},{scale:1,opacity:1,duration:.22,ease:"power4.out"},18.5);tl.fromTo("#coinsin .sub",{x:-60,opacity:0},{x:0,opacity:1,duration:.3,ease:"back.out(1.6)"},20.4);')
for t, v in [(18.5, "0"), (18.65, "23,481"), (18.8, "61,904"), (18.95, "88,312"), (19.1, "100,000")]:
    JS.append(f'tl.set("#cnum",{{textContent:"{v}"}},{t});')
# attention
EL.append(clip("att", 21.85, 4.25, '<div id="attin"><div class="eq"><span class="w1">ATTENTION</span><span class="up arrow">▲</span></div><div class="eq"><span class="w1">PRICE</span><span class="up arrow">▲</span></div><div class="sub">live Wikipedia pageviews drive fair value</div></div>', "left", 4))
JS.append('tl.fromTo("#attin .eq:nth-child(1)",{x:-80,opacity:0},{x:0,opacity:1,duration:.28,ease:"back.out(1.6)"},22.0);tl.fromTo("#attin .eq:nth-child(2)",{x:-80,opacity:0},{x:0,opacity:1,duration:.28,ease:"back.out(1.6)"},24.1);tl.fromTo("#attin .sub",{opacity:0},{opacity:1,duration:.3},24.6);')
# verbs
for i, (t, txt, d) in enumerate([(26.4, "PICK", 0.9), (27.3, "CHECK", 0.95), (28.25, "BUY", 0.55)]):
    EL.append(clip(f"vb{i}", t, d, f'<div class="slam big {"up" if txt=="BUY" else ""}" id="vb{i}b">{txt}</div>', "left", 4))
    JS.append(f'tl.fromTo("#vb{i}b",{{scale:2.2,opacity:0}},{{scale:1,opacity:1,duration:.18,ease:"power4.out"}},{t});')
# short
EL.append(clip("sh", 29.75, 2.65, '<div class="stampbox"><span id="shb" class="stamp down huge">SHORT THE<br>CRINGE</span></div>', "left", 4))
JS.append('tl.fromTo("#shb",{scale:2.4,rotation:0,opacity:0},{scale:1,rotation:-6,opacity:1,duration:.2,ease:"power4.out"},31.2);')
# bell
countdown("b", 32.4, ["00:00:03", "00:00:02", "00:00:01"], 0.74)
EL.append(clip("zero", 34.62, 1.4, '<b id="zerob">00:00:00</b><div id="ding">DING!</div>', "count", 6))
JS.append('tl.fromTo("#zerob",{scale:1.3,color:"#ffffff"},{scale:1,color:"#19f26b",duration:.2,ease:"power3.out"},34.62);tl.fromTo("#ding",{scale:3,opacity:0,rotation:8},{scale:1,opacity:1,rotation:-5,duration:.18,ease:"power4.out"},34.66);')
EL.append(clip("flash", 34.62, 0.3, '<div id="flashin"></div>', "full", 8))
JS.append('tl.fromTo("#flashin",{opacity:.9},{opacity:0,duration:.3,ease:"power2.out"},34.62);')
# ranked + flair
EL.append(clip("rank", 36.05, 3.35, '<div id="rankin"><div class="slam">YOU\'RE<br><span class="up">#1</span></div><div id="medal" class="flair"><i class="medal">1</i><div><b>Day 11 top trader</b><small>u/faazkhn · flair unlocked</small></div></div></div>', "left", 4))
JS.append('tl.fromTo("#rankin .slam",{scale:1.8,opacity:0},{scale:1,opacity:1,duration:.22,ease:"power4.out"},36.3);tl.fromTo("#medal",{y:80,opacity:0,scale:.7},{y:0,opacity:1,scale:1,duration:.34,ease:"back.out(2)"},38.45);')
# share
EL.append(clip("share", 39.45, 2.95, '<div id="sharein"><img id="post" src="assets/img/trade-post.jpg" alt="A trade card post"><span id="brag" class="stamp up">BRAG IT</span></div>', "full center", 4))
JS.append('tl.fromTo("#post",{y:120,opacity:0},{y:0,opacity:1,duration:.34,ease:"back.out(1.4)"},39.5);tl.fromTo("#brag",{scale:2.4,opacity:0,rotation:0},{scale:1,opacity:1,rotation:8,duration:.2,ease:"power4.out"},40.0);')
# tomorrow
EL.append(clip("tmr", 42.45, 4.15, '<div id="tmrin"><div class="kicker">next bell 00:00 UTC</div><div class="slam">DAY 13</div><div class="bar"><i id="barfill"></i></div><div class="sub">new listing · fresh 100k</div></div>', "left", 4))
JS.append('tl.fromTo("#tmrin .slam",{scale:1.8,opacity:0},{scale:1,opacity:1,duration:.22,ease:"power4.out"},43.2);tl.fromTo("#barfill",{scaleX:0},{scaleX:1,duration:3.2,ease:"power1.inOut"},43.3);tl.fromTo("#tmrin .sub",{opacity:0,x:-50},{opacity:1,x:0,duration:.3},44.6);')
# end card
EL.append(clip("end", 46.65, 5.35, '<div id="endin"><img id="logo2" src="assets/img/logo.png" alt="Dankrupt Exchange"><div id="cta" class="sticker yellow">PLAY FREE · r/dankrupt</div></div>', "full center", 6))
JS.append('tl.fromTo("#logo2",{scale:2.4,opacity:0},{scale:1,opacity:1,duration:.24,ease:"power4.out"},46.85);tl.fromTo("#endin",{x:0},{x:6,duration:.04,repeat:5,yoyo:true},47.09);tl.fromTo("#cta",{scale:0,rotation:-12},{scale:1,rotation:-3,duration:.34,ease:"back.out(2)"},48.5);')

# phone visibility (untimed wrapper; animate its child)
JS.append('''
const ph="#phonein";
tl.fromTo(ph,{x:300,opacity:0},{x:0,opacity:1,duration:.35,ease:"back.out(1.4)"},0.05);
tl.to(ph,{x:300,opacity:0,duration:.18,ease:"power2.in"},6.2);
tl.to(ph,{x:0,opacity:1,duration:.3,ease:"back.out(1.4)"},9.4);
tl.to(ph,{y:900,opacity:0,duration:.2,ease:"power2.in"},12.75);
tl.to(ph,{y:0,opacity:1,duration:.32,ease:"back.out(1.4)"},17.9);
tl.to(ph,{x:300,opacity:0,duration:.18,ease:"power2.in"},32.2);
tl.to(ph,{x:0,opacity:1,duration:.3,ease:"back.out(1.4)"},36.0);
tl.to(ph,{x:300,opacity:0,duration:.18,ease:"power2.in"},39.3);
tl.to(ph,{x:0,opacity:1,duration:.3,ease:"back.out(1.4)"},42.4);
tl.to(ph,{y:900,opacity:0,duration:.2,ease:"power2.in"},46.5);
''')

SFX = [("s_tick", "sfx_005", 0.0, 5.9, 0.35), ("s_up", "sfx_007", 2.6, 1.8, 0.35), ("s_rw", "sfx_006", 6.9, 2.6, 0.6), ("s_w1", "sfx_002", 9.35, 0.6, 0.6),
       ("s_slam", "sfx_003", 13.32, 2.0, 0.8), ("s_coin", "sfx_004", 18.5, 1.5, 0.7), ("s_w2", "sfx_008", 21.75, 1.2, 0.5), ("s_w3", "sfx_002", 26.05, 0.6, 0.5),
       ("s_slam2", "sfx_003", 31.2, 2.0, 0.55), ("s_tick2", "sfx_005", 32.4, 2.2, 0.4), ("s_bell", "sfx_001", 34.6, 2.6, 0.9), ("s_w4", "sfx_008", 39.4, 1.2, 0.5),
       ("s_rise", "sfx_007", 45.1, 1.8, 0.5), ("s_slam3", "sfx_003", 46.85, 2.0, 0.85)]
AUDIO = ['<audio id="voice" class="clip" src="assets/audio/voice.wav" data-start="0" data-duration="49.33" data-track-index="10" data-volume="1"></audio>']
AUDIO += [f'<audio id="{i}" class="clip" src="assets/audio/{f}.mp3" data-start="{s}" data-duration="{d}" data-track-index="11" data-volume="{v}"></audio>' for i, f, s, d, v in SFX]
import os
if os.path.exists("assets/audio/music.mp3"):
    AUDIO.append(f'<audio id="music" class="clip" src="assets/audio/music.mp3" data-start="0" data-duration="{DUR}" data-track-index="12" data-volume="0.16" data-fade-out="2"></audio>')

CSS = """
@font-face{font-family:Lilita;src:url(assets/fonts/lilita.woff2)}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1920px;height:1080px;overflow:hidden;background:#0c0c0c}
#root{position:relative;width:1920px;height:1080px;overflow:hidden;font-family:Lilita,sans-serif;color:#fff;background:#0c0c0c}
#bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.clip{position:absolute}
.full{inset:0}
.center{display:flex;align-items:center;justify-content:center}
.left{left:150px;top:150px;width:900px}
.up{color:#19f26b}.down{color:#ff3b3b}
.sticker{display:inline-block;font-size:64px;line-height:1;padding:18px 30px;background:#fff;color:#0c0c0c;border:6px solid #0c0c0c;border-radius:22px;box-shadow:8px 8px 0 #19f26b}
.sticker span{color:#0a9c43}
.sticker.yellow{background:#ffd400}
.slam{font-size:170px;line-height:.92;-webkit-text-stroke:10px #000;paint-order:stroke fill;text-shadow:8px 8px 0 #19f26b}
.slam.big{font-size:230px}
.kicker{font-size:54px;color:#19f26b;margin-bottom:10px;-webkit-text-stroke:6px #000;paint-order:stroke fill}
.sub{font-size:48px;margin-top:26px;color:#fff;-webkit-text-stroke:6px #000;paint-order:stroke fill;max-width:880px;line-height:1.1}
.count{left:120px;top:250px;width:1000px}
.count b{display:block;font-size:230px;font-weight:400;-webkit-text-stroke:12px #000;paint-order:stroke fill;text-shadow:10px 10px 0 #19f26b;font-variant-numeric:tabular-nums}
#zero{left:0;width:1920px;top:250px;text-align:center}
#b0,#b1,#b2{left:0;width:1920px;text-align:center}
#ding{display:inline-block;margin-top:10px;font-size:180px;color:#ffd400;-webkit-text-stroke:12px #000;paint-order:stroke fill}
.chip{left:130px;top:560px}
.soh{left:120px;top:690px}
.stamp{display:inline-block;font-size:110px;line-height:.95;padding:6px 26px;border:10px solid currentColor;border-radius:18px;background:#0c0c0c;text-align:center}
.stamp.huge{font-size:150px}
.or{font-size:60px;margin:0 22px;vertical-align:middle;color:#fff}
.rw{background:#0c0c0cdd;display:flex;align-items:center;justify-content:center}
#rwin{text-align:center}
#rwclock{font-size:220px;-webkit-text-stroke:12px #000;paint-order:stroke fill;text-shadow:10px 10px 0 #ff3b3b;font-variant-numeric:tabular-nums}
#rwlabel{font-size:90px;color:#ff3b3b;margin-top:10px}
.scan{position:absolute;inset:-120px 0 0 0;background:repeating-linear-gradient(0deg,#ffffff10 0 3px,transparent 3px 12px)}
#newpost{margin-top:36px}
#revin{display:flex;flex-direction:column;align-items:center}
#logo1,#logo2{width:1300px}
#tag{font-size:84px;margin-top:20px;-webkit-text-stroke:8px #000;paint-order:stroke fill}
#tag span{color:#19f26b}
.coinrow{display:flex;align-items:center;gap:30px}
.coin{display:inline-grid;place-items:center;width:150px;height:150px;border-radius:50%;background:#ffd400;border:10px solid #000;color:#000;font-style:normal;font-size:90px;box-shadow:8px 8px 0 #19f26b}
#cnum{font-size:190px;font-weight:400;-webkit-text-stroke:12px #000;paint-order:stroke fill;font-variant-numeric:tabular-nums}
.eq{display:flex;align-items:center;gap:24px;font-size:150px;line-height:1;-webkit-text-stroke:10px #000;paint-order:stroke fill;margin-bottom:10px}
.arrow{font-size:120px}
.stampbox{padding-top:120px}
.flair{display:flex;align-items:center;gap:26px;margin-top:40px;background:#fff;color:#0c0c0c;border:6px solid #000;border-radius:24px;padding:20px 34px;box-shadow:8px 8px 0 #ffd400;width:max-content}
.flair b{display:block;font-size:58px;font-weight:400}
.flair small{display:block;font-size:34px;color:#555;font-family:Nunito,sans-serif;font-weight:800}
.medal{display:grid;place-items:center;width:110px;height:110px;border-radius:50%;background:#ffd400;border:8px solid #000;font-style:normal;font-size:70px;color:#000}
#sharein{position:relative;display:flex;align-items:center;justify-content:center}
#post{width:1120px;border:8px solid #fff;border-radius:28px;box-shadow:14px 14px 0 #19f26b}
#brag{position:absolute;right:-80px;top:-50px}
.bar{width:820px;height:46px;margin-top:30px;border:8px solid #000;border-radius:24px;background:#fff;overflow:hidden}
#barfill{display:block;height:100%;background:#19f26b;transform-origin:left center}
#endin{display:flex;flex-direction:column;align-items:center}
#cta{margin-top:30px;font-size:80px}
#endsub{font-size:52px;margin-top:30px;-webkit-text-stroke:6px #000;paint-order:stroke fill}
#flashin{position:absolute;inset:0;background:#fff}
#phone{position:absolute;left:1260px;top:70px;width:422px;height:896px}
#phonein{position:absolute;inset:0;border-radius:52px;border:8px solid #fff;outline:8px solid #000;background:#000;box-shadow:16px 16px 0 #19f26b;overflow:hidden}
.vid{position:absolute;left:0;top:0;width:406px;height:880px;object-fit:cover}
.cap{left:0;width:1920px;bottom:52px;text-align:center}
.capin{display:inline-block;font-size:66px;line-height:1.1;-webkit-text-stroke:10px #000;paint-order:stroke fill;max-width:1500px}
.capin .w{display:inline-block}
"""

page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=1920, height=1080"><title>Dankrupt Exchange · Devpost demo</title>
<script src="assets/gsap.min.js"></script><style>{CSS}</style></head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{DUR}" data-width="1920" data-height="1080" data-fps="30">
<img id="bg" src="assets/img/bg.jpg" alt="">
<div id="phone"><div id="phonein">
{chr(10).join(VIDEOS)}
</div></div>
{chr(10).join(EL)}
{chr(10).join(CAP_HTML)}
{chr(10).join(AUDIO)}
</div>
<script>
const tl = gsap.timeline({{ paused: true }});
{chr(10).join(JS)}
{chr(10).join(CAP_JS)}
window.__timelines = window.__timelines || {{}};
window.__timelines["main"] = tl;
</script>
</body></html>
"""
open("index.html", "w").write(page)
print(len(groups), "caption groups")
