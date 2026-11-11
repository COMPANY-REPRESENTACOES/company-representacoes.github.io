var PDF_WIDTHS = {"Helvetica":[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],"Helvetica-Bold":[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,350,278,556,500,1000,556,556,333,1000,667,333,1000,350,611,350,350,278,278,500,500,350,556,1000,333,1000,556,333,944,350,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556]};
var WINANSI_EXTRA = {0x20AC:128,0x201A:130,0x192:131,0x201E:132,0x2026:133,0x2020:134,0x2021:135,0x2C6:136,0x2030:137,0x160:138,0x2039:139,0x152:140,0x17D:142,0x2018:145,0x2019:146,0x201C:147,0x201D:148,0x2022:149,0x2013:150,0x2014:151,0x2DC:152,0x2122:153,0x161:154,0x203A:155,0x153:156,0x17E:158,0x178:159};

function pdfEnc(s){
  s = String(s == null ? '' : s);
  if (s.normalize) s = s.normalize('NFC');
  var o = '';
  for (var i=0;i<s.length;i++){
    var c = s.charCodeAt(i);
    if ((c>=32 && c<127) || (c>=160 && c<=255)) o += String.fromCharCode(c);
    else if (WINANSI_EXTRA[c]) o += String.fromCharCode(WINANSI_EXTRA[c]);
    else if (c===9 || c===10 || c===13) o += ' ';
    else if (c===0x202F || c===0x2007) o += ' ';
  }
  return o;
}
function pdfWidth(s, bold, size){
  var e = pdfEnc(s), t = bold ? PDF_WIDTHS['Helvetica-Bold'] : PDF_WIDTHS['Helvetica'], w = 0;
  for (var i=0;i<e.length;i++){ w += (t[e.charCodeAt(i)-32] || 556); }
  return w * size / 1000;
}
function pdfWrap(s, bold, size, maxW){
  var words = String(s||'').split(/\s+/).filter(Boolean), lines = [], cur = '';
  words.forEach(function(w){
    var test = cur ? cur + ' ' + w : w;
    if (pdfWidth(test, bold, size) <= maxW || !cur){
      cur = test;
      while (pdfWidth(cur, bold, size) > maxW && cur.length > 1){
        var cut = cur.length - 1;
        while (cut > 1 && pdfWidth(cur.slice(0,cut), bold, size) > maxW) cut--;
        lines.push(cur.slice(0,cut)); cur = cur.slice(cut);
      }
    } else { lines.push(cur); cur = w; }
  });
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}
function hexRGB(h){
  h = h.replace('#','');
  return [0,2,4].map(function(i){ return (parseInt(h.substr(i,2),16)/255).toFixed(3); }).join(' ');
}

function PdfDoc(){
  this.W = 595.28; this.H = 841.89;
  this.pages = []; this.images = [];
  this.addPage();
}
PdfDoc.prototype.addPage = function(){ this.ops = []; this.pages.push(this.ops); };
PdfDoc.prototype.text = function(x, y, s, o){
  o = o || {};
  var size = o.size || 10, bold = !!o.bold;
  if (o.align === 'right') x -= pdfWidth(s, bold, size);
  else if (o.align === 'center') x -= pdfWidth(s, bold, size)/2;
  var e = pdfEnc(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
  this.ops.push('BT /' + (bold?'F2':'F1') + ' ' + size + ' Tf ' + hexRGB(o.color||'#1b1b1d') + ' rg ' +
    x.toFixed(2) + ' ' + (this.H - y).toFixed(2) + ' Td (' + e + ') Tj ET');
};
PdfDoc.prototype.rect = function(x, y, w, h, fill, stroke, lw){
  var s = 'q ';
  if (fill) s += hexRGB(fill) + ' rg ';
  if (stroke) s += hexRGB(stroke) + ' RG ' + (lw||0.6) + ' w ';
  s += x.toFixed(2)+' '+(this.H-y-h).toFixed(2)+' '+w.toFixed(2)+' '+h.toFixed(2)+' re ' + (fill && stroke ? 'B' : fill ? 'f' : 'S') + ' Q';
  this.ops.push(s);
};
PdfDoc.prototype.line = function(x1, y1, x2, y2, color, lw){
  this.ops.push('q ' + hexRGB(color||'#cccccc') + ' RG ' + (lw||0.6) + ' w ' +
    x1.toFixed(2)+' '+(this.H-y1).toFixed(2)+' m '+x2.toFixed(2)+' '+(this.H-y2).toFixed(2)+' l S Q');
};
PdfDoc.prototype.addJpeg = function(dataUrl, pxW, pxH){
  var b64 = dataUrl.split(',')[1];
  this.images.push({ data: atob(b64), w: pxW, h: pxH });
  return this.images.length - 1;
};
PdfDoc.prototype.image = function(idx, x, y, w, h){
  this.ops.push('q '+w.toFixed(2)+' 0 0 '+h.toFixed(2)+' '+x.toFixed(2)+' '+(this.H-y-h).toFixed(2)+' cm /Im'+idx+' Do Q');
};
PdfDoc.prototype.output = function(){
  var self = this, objs = [];
  function add(s){ objs.push(s); return objs.length; }
  var catalogId = add(null), pagesId = add(null);
  var f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  var f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  var imgIds = this.images.map(function(im){
    return add('<< /Type /XObject /Subtype /Image /Width '+im.w+' /Height '+im.h+
      ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+im.data.length+' >>\nstream\n'+im.data+'\nendstream');
  });
  var xobj = imgIds.map(function(id,i){ return '/Im'+i+' '+id+' 0 R'; }).join(' ');
  var res = '<< /Font << /F1 '+f1+' 0 R /F2 '+f2+' 0 R >>' + (xobj ? ' /XObject << '+xobj+' >>' : '') + ' >>';
  var pageIds = this.pages.map(function(ops){
    var content = ops.join('\n');
    var cId = add('<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream');
    return add('<< /Type /Page /Parent '+pagesId+' 0 R /MediaBox [0 0 '+self.W+' '+self.H+'] /Resources '+res+' /Contents '+cId+' 0 R >>');
  });
  objs[catalogId-1] = '<< /Type /Catalog /Pages '+pagesId+' 0 R >>';
  objs[pagesId-1] = '<< /Type /Pages /Kids ['+pageIds.map(function(i){return i+' 0 R';}).join(' ')+'] /Count '+pageIds.length+' >>';
  var out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', offsets = [];
  objs.forEach(function(o,i){ offsets.push(out.length); out += (i+1)+' 0 obj\n'+o+'\nendobj\n'; });
  var xref = out.length;
  out += 'xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n';
  offsets.forEach(function(off){ out += ('0000000000'+off).slice(-10)+' 00000 n \n'; });
  out += 'trailer\n<< /Size '+(objs.length+1)+' /Root '+catalogId+' 0 R >>\nstartxref\n'+xref+'\n%%EOF';
  var bytes = new Uint8Array(out.length);
  for (var i=0;i<out.length;i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
};

function logoToJpeg(imgEl, maxPx){
  try{
    if (!imgEl || !imgEl.naturalWidth) return null;
    var r = Math.min(1, maxPx / imgEl.naturalWidth);
    var w = Math.max(1, Math.round(imgEl.naturalWidth * r)), h = Math.max(1, Math.round(imgEl.naturalHeight * r));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,w,h);
    ctx.drawImage(imgEl, 0, 0, w, h);
    return { url: c.toDataURL('image/jpeg', 0.92), w: w, h: h };
  }catch(e){ return null; }
}

