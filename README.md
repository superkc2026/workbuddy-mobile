# WorkBuddy 鎵嬫満鐗?
> 鐢ㄦ墜鏈鸿繙绋嬫搷鎺х數鑴戜笂鐨?WorkBuddy AI 鍔╂墜锛岄殢鏃堕殢鍦版煡鐪嬩换鍔¤繘灞曘€佸彂閫佹寚浠ゃ€侀瑙堜骇鐗┿€?
<p align="center">
  <img src="screenshots/1-鐧诲綍椤?png" width="200" alt="鐧诲綍椤? />
  <img src="screenshots/2-澶氫换鍔″垪琛?png" width="200" alt="澶氫换鍔″垪琛? />
  <img src="screenshots/3-鎵ц浠诲姟.png" width="200" alt="鎵ц浠诲姟" />
</p>

## 鉁?鍔熻兘浜偣

- 馃摫 **鎵嬫満杩滅▼鎿嶆帶** 鈥?鎵嬫満娴忚鍣ㄦ墦寮€鍗崇敤锛屾棤闇€瀹夎 APP
- 馃攧 **瀹炴椂鍚屾** 鈥?鐢佃剳绔殑浠诲姟銆佸璇濄€佷骇鐗╁疄鏃跺悓姝ュ埌鎵嬫満
- 馃殌 **涓夊眰杩炴帴鏂规** 鈥?灞€鍩熺綉鐩磋繛 / UPnP / Cloudflare Tunnel锛岃嚜鍔ㄩ檷绾э紝闆堕厤缃?- 馃挰 **鍙屽悜瀵硅瘽** 鈥?鎵嬫満鍙戞秷鎭紝AI 鍥炲锛岃窡鐢佃剳绔綋楠屼竴鑷?- 馃搸 **鏂囦欢涓婁紶** 鈥?鎵嬫満鎷嶇収銆侀€夋枃浠剁洿鎺ュ彂缁?AI
- 馃搵 **浜х墿棰勮** 鈥?浠ｇ爜銆佹枃妗ｃ€佸浘琛ㄥ湪绾块瑙?- 馃敀 **瀹夊叏璁よ瘉** 鈥?6 浣嶈闂爜 + Token 鍙岄噸璁よ瘉
- 馃搳 **绉垎缁熻** 鈥?浠婃棩娑堣€?+ 绱浣跨敤涓€鐩簡鐒?- 馃摑 **鍙嶉閫氶亾** 鈥?鍐呯疆闇€姹傚缓璁拰闂鍙嶉锛岃嚜鍔ㄦ敹闆嗙郴缁熶俊鎭?- 鈿?**鏁版嵁缂撳瓨** 鈥?浠诲姟鍒楄〃鍜屽璇濆巻鍙叉湰鍦扮紦瀛橈紝鎵撳紑鍗崇湅
- 馃搶 **缃《鍚屾** 鈥?鎵嬫満绔疆椤堕€氳繃 SQLite 瀹夊叏灞傚悓姝ュ埌鐢佃剳绔紙涓嶅啓 leveldb锛岄伩鍏嶅穿搴擄級

## 馃敆 杩炴帴鏂瑰紡

| 鏂瑰紡 | 鍦烘櫙 | 闇€瑕佸畨瑁?| 閫熷害 |
|------|------|---------|------|
| 灞€鍩熺綉鐩磋繛 | 鍚屼竴 WiFi | 鏃?| 鈿?鏈€蹇?|
| UPnP 绔彛杞彂 | 瀹跺涵缃戠粶 | 鏃?| 馃殌 蹇?|
| Cloudflare Tunnel | 鍏徃缃戠粶 / 浠讳綍缃戠粶 | 鑷姩涓嬭浇 cloudflared | 鉁?绋冲畾 |

Gateway 鍚姩鏃惰嚜鍔ㄦ娴嬪彲鐢ㄦ柟寮忥紝鎸変紭鍏堢骇 A鈫払鈫扖 闄嶇骇銆?*鐢ㄦ埛鏃犻渶鎵嬪姩閰嶇疆锛屾墦寮€鍗崇敤銆?*

### 鎵嬫満杩炴帴娴佺▼

1. 鐢佃剳绔?Gateway 鍚姩鍚庤嚜鍔ㄧ敓鎴?6 浣嶈闂爜
2. 鎵嬫満娴忚鍣ㄦ墦寮€ `wb.loveclaw.fun`
3. 杈撳叆璁块棶鐮侊紝鍕鹃€?璁颁綇璁块棶鐮?
4. 鑷姩杩炴帴鍒颁綘鐨?Gateway

> 鐢佃剳閲嶅惎鍚庤闂爜涓嶅彉锛孋loudflare URL 鑷姩鏇存柊锛屾墜鏈烘棤闇€閲嶆柊杈撳叆銆?
## 馃摝 瀹夎

### Windows

1. 瀹夎 [WorkBuddy 妗岄潰鐗圿(https://www.codebuddy.cn/work/)
2. 涓嬭浇 `WorkBuddy-Mobile-Windows-x.x.x.zip`锛圼鏈€鏂扮増](https://github.com/superkc2026/workbuddy-mobile/releases/latest)锛?3. 瑙ｅ帇鍒?`~/WorkBuddy/mobile-remote/`
4. 杩愯 `start.ps1` 鍚姩 Gateway
5. 杩愯 `install-task.ps1` 璁剧疆寮€鏈鸿嚜鍚紙鍙€夛級

### Mac

1. 瀹夎 WorkBuddy 妗岄潰鐗?2. 涓嬭浇 `WorkBuddy-Mobile-Mac-x.x.x.zip`锛圼鏈€鏂扮増](https://github.com/superkc2026/workbuddy-mobile/releases/latest)锛?3. 瑙ｅ帇鍒?`~/WorkBuddy/mobile-remote/`
4. 杩愯 `bash start.sh` 鍚姩 Gateway
5. 杩愯 `bash install-launchd.sh` 璁剧疆寮€鏈鸿嚜鍚紙鍙€夛級

### 涓€閿畨瑁咃紙鎺ㄨ崘锛?
鍦?WorkBuddy 涓畨瑁呴儴缃?Skill 鍚庯紝鐩存帴璇?瀹夎鎵嬫満鐗?锛孲kill 浼氳嚜鍔ㄤ粠 GitHub 涓嬭浇鏈€鏂扮増骞惰В鍘嬪畨瑁呫€傛敮鎸佸悗缁"鏇存柊鎵嬫満鐗?鑷姩妫€鏌ユ洿鏂般€?
### 鎵嬫満绔?
鏃犻渶瀹夎浠讳綍涓滆タ锛岀敤娴忚鍣ㄦ墦寮€ `wb.loveclaw.fun`锛岃緭鍏ヨ闂爜鍗冲彲銆?
## 馃彈锔?鏋舵瀯

```
鎵嬫満娴忚鍣?    鈫?(HTTPS)
Gateway (Node.js, :18787)
    鈫?(ACP 鍗忚)
WorkBuddy 妗岄潰绔?    鈫?(API)
AI 妯″瀷 (GPT-4o, Claude, GLM 绛?
```

### 涓夊眰杩炴帴鏂规

```
Gateway 鍚姩
  鈹溾攢鈹€ A 妫€娴嬪眬鍩熺綉 IP 鈫?192.168.x.x:18787锛堝悓 WiFi 鐢ㄦ埛锛?  鈹溾攢鈹€ B 灏濊瘯 UPnP 鈫?鍏綉IP:18787锛堝搴綉缁滅敤鎴凤級
  鈹溾攢鈹€ C 鍚姩 Cloudflare Tunnel 鈫?xxx.trycloudflare.com锛堝叕鍙?鍏朵粬缃戠粶鐢ㄦ埛锛?```

姣忓眰鐙珛杩愯锛岃嚜鍔ㄩ檷绾с€傜敤鎴风數鑴戣嚜宸卞綋鏈嶅姟鍣紝涓嶄緷璧栦换浣曚腑蹇冭妭鐐广€?
### 闅ч亾鎺夌嚎鑷剤

Cloudflare Tunnel 鍋跺彂"鍋囨"锛堣繘绋嬪湪浣嗕笉杞彂锛夛紝Gateway 姣?30 绉掓帰娴嬩竴娆★紝鍋囨鏃惰嚜鍔?kill + 閲嶅惎 + 閲嶆敞鍐岃闂爜銆?
## 馃洜锔?鎶€鏈爤

| 缁勪欢 | 鎶€鏈?| 璇存槑 |
|------|------|------|
| Gateway | Node.js 22 | 鍘熺敓 HTTP 鏈嶅姟鍣紝绔彛 18787 |
| 鍓嶇 | PWA | 鍗曢〉搴旂敤锛屽師鐢?JS + CSS锛屾敮鎸佺绾跨紦瀛?|
| 鏁版嵁搴?| node:sqlite | Node.js 鍐呯疆 SQLite锛屾棤闇€澶栭儴渚濊禆 |
| Mac 缃《璇诲彇 | Python 姝ｅ垯 | 鐩磋 leveldb 鍘熷瀛楄妭锛圲TF-16LE锛夛紝涓嶄緷璧?Node level 搴?|
| 缃《鍚屾 | SQLite pins 琛?| 璺ㄨ澶囩湡鐩告簮锛屼笉鍐?leveldb 閬垮厤宕╁簱 |
| 杩炴帴鏂规 | 灞€鍩熺綉 / UPnP / Cloudflare Tunnel | 涓夊眰鑷姩闄嶇骇 |
| 闅ч亾鑷剤 | 30s 鎺㈡祴 | 鍋囨鑷姩閲嶅惎 + 閲嶆敞鍐?|
| 璁块棶鐮?| 6 浣嶉殢鏈虹爜 | 21 浜跨缁勫悎锛屾案涔呬笉鍙?|

## 馃搵 绯荤粺瑕佹眰

| 椤圭洰 | 瑕佹眰 |
|------|------|
| 鎿嶄綔绯荤粺 | Windows 10/11 鎴?macOS |
| Node.js | 22+锛圵orkBuddy 妗岄潰鐗堝凡鍐呯疆锛?|
| WorkBuddy | 鏈€鏂扮増 |
| 鎵嬫満 | 浠讳綍鏈夋祻瑙堝櫒鐨勮澶?|
| 缃戠粶 | WiFi / 绉诲姩缃戠粶鍧囧彲 |

## 鉂?甯歌闂

<details>
<summary><b>鎵嬫満鎵撲笉寮€ Gateway 鍦板潃锛?/b></summary>

- 纭鐢佃剳宸插紑鏈轰笖 WorkBuddy 姝ｅ湪杩愯
- 纭 Gateway 鍦ㄨ繍琛岋紙鐢佃剳绔棶 WorkBuddy "鎵嬫満鐗堝湴鍧€"锛?- 濡傛灉鍦ㄥ叕鍙哥綉缁滐紝Cloudflare Tunnel 浼氳嚜鍔ㄥ惎鍔紝鍙兘闇€瑕佺瓑 10-30 绉?</details>

<details>
<summary><b>鎵嬫満鐪嬩笉鍒颁换鍔″垪琛紵</b></summary>

- 涓嬫媺鍒锋柊椤甸潰
- 纭鐢佃剳绔?WorkBuddy 鏈変换鍔″湪杩愯
- 娓呴櫎娴忚鍣ㄧ紦瀛樺悗閲嶈瘯
</details>

<details>
<summary><b>鍙戞秷鎭悗娌℃敹鍒板洖澶嶏紵</b></summary>

- 纭鐢佃剳绔?WorkBuddy 妗岄潰鐗堟鍦ㄨ繍琛?- AI 澶勭悊鍙兘闇€瑕佸嚑绉掑埌鍑犲崄绉?- 濡傛灉闀挎椂闂存病鍥炲锛屽彲鑳芥槸 serve 杩涚▼鏈惎鍔紝鍦ㄧ數鑴戠閲嶆柊鎵撳紑 WorkBuddy
</details>

<details>
<summary><b>鐢佃剳閲嶅惎鍚庢墜鏈鸿繛涓嶄笂浜嗭紵</b></summary>

Cloudflare Tunnel 鐨勫湴鍧€姣忔閲嶅惎閮戒細鍙橈紝浣嗚闂爜涓嶅彉銆傛墜鏈烘墦寮€ `wb.loveclaw.fun` 杈撳叆璁块棶鐮佸嵆鍙€傚鏋滈厤缃簡寮€鏈鸿嚜鍚紙Windows: install-task.ps1 / Mac: install-launchd.sh锛夛紝閲嶅惎鍚庣瓑 30 绉掑嵆鍙€?</details>

<details>
<summary><b>蹇樿璁块棶鐮佷簡锛?/b></summary>

鍦ㄧ數鑴戠闂?WorkBuddy "鎵嬫満鐗堣闂爜鏄粈涔?锛屼細杩斿洖浣犵殑 6 浣嶈闂爜銆?</details>

## 馃攧 鏇存柊鏃ュ織

### v2.0.7 (2026-07-15)

**閲嶅ぇ鏀瑰姩锛?*
- Windows 瀹夎鍖呬粠 .exe 鏀逛负 .zip锛堣В鍘嬪嵆鐢紝鏃犻渶绠＄悊鍛樻潈闄愶級
- 鏂板 Windows start.ps1 鍚姩鑴氭湰 + install-task.ps1 寮€鏈鸿嚜鍚?- 娑堟伅閲嶅淇锛堟垚鍔熻矾寰?serve 鍗曚竴鍐欏叆锛屾墜鏈虹涓嶅弻鍐欙級

**Mac 绔?13 椤逛紭鍖栵細**
- 浜х墿 404 淇锛坲ri.slice 鈫?new URL().pathname锛?- Cmd+R 鏀逛负鑿滃崟鐐瑰嚮銆屾煡鐪嬧啋閲嶆柊鍔犺浇銆嶏紙Cmd+R 鍦?WorkBuddy 鏈粦瀹氾級
- 闅ч亾鎺夌嚎鑷剤锛?0s 鎺㈡祴鍋囨 鈫?kill 鈫?閲嶅惎 鈫?閲嶆敞鍐岋級
- 缃《鏀圭敤 Python getPinnedSessions锛堟鍒欑洿璇?leveldb锛屼笉渚濊禆鍧忔帀鐨?Node level 搴擄級
- 缃《鍚屾瀹夊叏灞傦紙SQLite pins 琛?+ getSqlitePins/setPin + POST pin 鎺ュ彛 + togglePin async锛?- 姝讳唬鐮佹竻鐞嗭紙鍒?pinned-reader.cjs + getPinnedSessionsFromLevelDB锛?- CSS 鍙鎬т紭鍖栵紙瀛椾綋鍔犲ぇ銆侀棿璺濆姞瀹姐€佺伆鑹插姞娣憋級
- readJson 500 淇 + /feedback-viewer 璺敱
- cloudflared 鍥藉唴婧愶紙proxy.gitwarp.com锛?- start.sh 瀛ゅ効杩涚▼娓呯悊锛坈loudflared + watchdog-child锛?- gateway.log 鏃ュ織杞浆锛堥伩鍏嶉潤榛樺け鏁堬級

### v2.0.5 (2026-07-14)

**鏂板姛鑳斤細**
- 6 浣嶈闂爜绯荤粺锛堟浛浠?PIN锛?1 浜跨缁勫悎锛?- 璁块棶鐮佽浣忓姛鑳斤紙localStorage锛屼笅娆¤嚜鍔ㄨ繛鎺ワ級
- PWA 鏁版嵁缂撳瓨锛堜换鍔″垪琛?+ 瀵硅瘽鍘嗗彶锛屾墦寮€鍗崇湅锛?- 浠婃棩绉垎灞曠ず锛堝揩鐓у姣旀硶锛?- 椋炰功缇や簩缁寸爜鍏ュ彛
- 鍙嶉绯荤粺锛堥渶姹傚缓璁?+ 闂鍙嶉锛?- 鍏ㄨ嚜鍔ㄥ畨瑁?Skill锛圙itHub API 鏌ョ増鏈?鈫?涓嬭浇 鈫?瑙ｅ帇瀹夎锛?
**浼樺寲锛?*
- 鍥剧墖鍘嬬缉锛坙ogo 51KB锛孮R 285KB锛?- node:sqlite 鏇夸唬 Python锛堟秷闄ゅ閮ㄤ緷璧栵級
- 娑堟伅鍘嗗彶涓婇檺鎻愬崌鍒?128MB
- 璁剧疆椤?Tab 鏍峰紡閲嶆瀯

### v2.0.3 (2026-07-13)

- Relay 涓户妯″紡
- PWA 閫氳繃 Relay 璁块棶
- 鑷缓 DERP 涓户
- Android APK 鎵撳寘

## 馃搫 License

MIT

---

<div align="center">

**Power by 瓒呰€佸笀 & WorkBuddy**

[涓嬭浇瀹夎鍖匽(https://github.com/superkc2026/workbuddy-mobile/releases/latest) 路 [寰簯澶囩敤](https://share.weiyun.com/MK9aZFKr) 路 [鍙嶉寤鸿](https://github.com/superkc2026/workbuddy-mobile/issues)

</div>
