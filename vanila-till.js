"use strict";
const { requestAnimationFrame, cancelAnimationFrame } = window;
const isSettingTrue = (val) => val === "" || val === true;
const SETTINGS = {
  reverse: false,
  max: 15,
  startX: 0,
  startY: 0,
  perspective: 1000,
  easing: "cubic-bezier(.03,.98,.52,.99)",
  scale: 1,
  speed: 300,
  transition: true,
  axis: null,
  glare: false,
  "max-glare": 1,
  "glare-prerender": false,
  "full-page-listening": false,
  "mouse-event-element": null,
  "reset-to-start": true,
  gyroscope: true,
  gyroscopeMinAngleX: -45,
  gyroscopeMaxAngleX: 45,
  gyroscopeMinAngleY: -45,
  gyroscopeMaxAngleY: 45,
  gyroscopeSamples: 10,
};
class VanillaTilt {
  constructor(element, settings = {}) {
    if (!(element instanceof Node)) throw new Error("Can't initialize VanillaTilt because " + element + " is not a Node.");
    this.width = null; this.height = null; this.clientWidth = null; this.clientHeight = null;
    this.left = null; this.top = null;
    this.gammazero = null; this.betagero = null;
    this.lastGamez = null; this.lastBetaz = null;
    this.transitionTimeout = null; this.updateCall = null; this.event = null;
    this.updateBind = this.update.bind(this);
    this.resetBind = this.reset.bind(this);
    this.element = element;
    this.settings = this.extendSettings(settings);
    this.reverse = this.settings.reverse ? -1 : 1;
    this.glare = isSettingTrue(this.settings.glare);
    this.glarePrerender = isSettingTrue(this.settings["glare-prerender"]);
    this.fullPageListening = isSettingTrue(this.settings["full-page-listening"]);
    this.resetToStart = isSettingTrue(this.settings["reset-to-start"]);
    this.gyroscope = isSettingTrue(this.settings.gyroscope);
    this.gyroscopeSamples = this.settings.gyroscopeSamples;
    this.settingsThatNeedRecalculation = [
      "full-page-listening", "mouse-event-element", "glare", "glare-prerender",
      "reverse", "axis", "reset-to-start"
    ];
    if (this.glare) {
      if (!this.glarePrerender) this.prepareGlare();
      this.glareElement = this.element.querySelector(".js-tilt-glare-inner");
    }
    if (this.fullPageListening) this.setSize();
    this.addEventListeners();
    this.reset();
    if (this.resetToStart === false) {
      this.settings.startX = this.settings.startX ?? 0;
      this.settings.startY = this.settings.startY ?? 0;
      this.moveToStartingPosition();
    }
  }
  addEventListeners() {
    this.onMouseEnterBind = this.onMouseEnter.bind(this);
    this.onMouseLeaveBind = this.onMouseLeave.bind(this);
    this.onMouseMoveBind = this.onMouseMove.bind(this);
    this.onTouchStartBind = this.onTouchStart.bind(this);
    this.onTouchMoveBind = this.onTouchMove.bind(this);
    this.onTouchEndBind = this.onTouchEnd.bind(this);
    this.onWindowResizeBind = this.onWindowResize.bind(this);
    const me = this.getMouseEventElement();
    me.addEventListener("mouseenter", this.onMouseEnterBind);
    me.addEventListener("mouseleave", this.onMouseLeaveBind);
    me.addEventListener("mousemove", this.onMouseMoveBind);
    if (this.settings.glare || this.fullPageListening) window.addEventListener("resize", this.onWindowResizeBind);
    if (this.gyroscope) window.addEventListener("deviceorientation", this.onDeviceOrientationBind = this.onDeviceOrientation.bind(this));
    me.addEventListener("touchstart", this.onTouchStartBind, { passive: true });
    me.addEventListener("touchend", this.onTouchEndBind);
    me.addEventListener("touchmove", this.onTouchMoveBind, { passive: true });
  }
  removeEventListeners() {
    const me = this.getMouseEventElement();
    me.removeEventListener("mouseenter", this.onMouseEnterBind);
    me.removeEventListener("mouseleave", this.onMouseLeaveBind);
    me.removeEventListener("mousemove", this.onMouseMoveBind);
    me.removeEventListener("touchstart", this.onTouchStartBind);
    me.removeEventListener("touchend", this.onTouchEndBind);
    me.removeEventListener("touchmove", this.onTouchMoveBind);
    if (this.settings.glare || this.fullPageListening) window.removeEventListener("resize", this.onWindowResizeBind);
    if (this.gyroscope) window.removeEventListener("deviceorientation", this.onDeviceOrientationBind);
  }
  destroy() {
    clearTimeout(this.transitionTimeout);
    if (this.updateCall !== null) cancelAnimationFrame(this.updateCall);
    this.reset();
    this.removeEventListeners();
    this.element.vanillaTilt = null;
    delete this.element.vanillaTilt;
    this.element = null;
  }
  getMouseEventElement() {
    const s = this.settings["mouse-event-element"];
    if (s) {
      if (typeof s === "string") { const el = document.querySelector(s); if (el) return el; }
      else if (s instanceof Node) return s;
    }
    if (this.fullPageListening) return window;
    return this.element;
  }
  onDeviceOrientation(e) {
    if (e.gamma == null || e.beta == null) return;
    this.updateElementPosition();
    if (this.gyroscopeSamples > 0) {
      this.lastGamez = (this.lastGamez || e.gamma);
      this.lastBetaz = (this.lastBetaz || e.beta);
      const totalDeltaGamma = Math.abs(e.gamma - this.lastGamez);
      const totalDeltaBeta = Math.abs(e.beta - this.lastBetaz);
      if (this.gyroscopeSamples === this.settings.gyroscopeSamples) {
        this.gammazero = this.lastGamez; this.betagero = this.lastBetaz;
      }
      this.lastGamez = e.gamma; this.lastBetaz = e.beta;
      this.gyroscopeSamples -= 1;
      return;
    }
    const totalAngleX = this.settings.gyroscopeMaxAngleX - this.settings.gyroscopeMinAngleX;
    const totalAngleY = this.settings.gyroscopeMaxAngleY - this.settings.gyroscopeMinAngleY;
    const degreesPerPixelX = totalAngleX / this.width;
    const degreesPerPixelY = totalAngleY / this.height;
    const angleX = e.gamma - (this.settings.gyroscopeMinAngleX + this.gammazero);
    const angleY = e.beta - (this.settings.gyroscopeMinAngleY + this.betagero);
    const posX = angleX / degreesPerPixelX;
    const posY = angleY / degreesPerPixelY;
    this.event = { clientX: posX + this.left, clientY: posY + this.top };
    this.updateCall = requestAnimationFrame(this.updateBind);
  }
  onMouseEnter() {
    this.updateElementPosition();
    this.element.style.willChange = "transform";
    this.setTransition();
  }
  onMouseMove(e) { if (this.updateCall !== null) cancelAnimationFrame(this.updateCall); this.event = e; this.updateCall = requestAnimationFrame(this.updateBind); }
  onMouseLeave(e) { this.setTransition(); if (this.resetToStart !== false) requestAnimationFrame(this.resetBind); }
  onTouchStart(e) { this.updateElementPosition(); if (e.touches && e.touches.length > 0) this.onMouseEnter(); }
  onTouchEnd(e) { this.onMouseLeave(e); }
  onTouchMove(e) { if (e.touches && e.touches.length > 0) this.onMouseMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }); }
  reset() {
    this.event = { clientX: this.left + this.width / 2, clientY: this.top + this.height / 2 };
    if (this.element && this.element.style) {
      this.element.style.transform = `perspective(${this.settings.perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
    }
    if (this.glare && this.glareElement) {
      this.glareElement.style.transform = "rotate(180deg) translate(-50%, -50%)";
      this.glareElement.style.opacity = "0";
    }
  }
  getValues() {
    let x, y;
    if (this.fullPageListening) {
      x = this.event.clientX / this.clientWidth; y = this.event.clientY / this.clientHeight;
    } else {
      x = (this.event.clientX - this.left) / this.width;
      y = (this.event.clientY - this.top) / this.height;
    }
    x = Math.min(Math.max(x, 0), 1); y = Math.min(Math.max(y, 0), 1);
    const tiltX = (this.reverse * (this.settings.max / 2 - x * this.settings.max)).toFixed(2);
    const tiltY = (this.reverse * (y * this.settings.max - this.settings.max / 2)).toFixed(2);
    const angle = Math.atan2(this.event.clientX - (this.left + this.width / 2), -(this.event.clientY - (this.top + this.height / 2))) * (180 / Math.PI);
    return { tiltX, tiltY, percentageX: x * 100, percentageY: y * 100, angle };
  }
  updateElementPosition() {
    const rect = this.element.getBoundingClientRect();
    if (this.fullPageListening) {
      this.clientWidth = window.innerWidth || document.documentElement.clientWidth;
      this.clientHeight = window.innerHeight || document.documentElement.clientHeight;
    }
    this.width = this.element.offsetWidth; this.height = this.element.offsetHeight;
    this.left = rect.left; this.top = rect.top;
  }
  update() {
    const values = this.getValues();
    this.element.style.transform = `perspective(${this.settings.perspective}px) rotateX(${this.settings.axis === "x" ? 0 : values.tiltY}deg) rotateY(${this.settings.axis === "y" ? 0 : values.tiltX}deg) scale3d(${this.settings.scale}, ${this.settings.scale}, ${this.settings.scale})`;
    if (this.glare && this.glareElement) {
      this.glareElement.style.transform = `rotate(${values.angle}deg) translate(-50%, -50%)`;
      this.glareElement.style.opacity = `${values.percentageY * this.settings["max-glare"] / 100}`;
    }
    this.element.dispatchEvent(new CustomEvent("tiltChange", { detail: values }));
    this.updateCall = null;
  }
  prepareGlare() {
    const jsTiltGlare = document.createElement("div"); jsTiltGlare.classList.add("js-tilt-glare");
    const jsTiltGlareInner = document.createElement("div"); jsTiltGlareInner.classList.add("js-tilt-glare-inner");
    jsTiltGlare.appendChild(jsTiltGlareInner); this.element.appendChild(jsTiltGlare);
    const jsTiltGlareStyle = jsTiltGlare.style;
    jsTiltGlareStyle.position = "absolute"; jsTiltGlareStyle.top = "0"; jsTiltGlareStyle.left = "0";
    jsTiltGlareStyle.width = "100%"; jsTiltGlareStyle.height = "100%"; jsTiltGlareStyle.overflow = "hidden";
    jsTiltGlareStyle.pointerEvents = "none"; jsTiltGlareStyle.borderRadius = "inherit";
    const jsTiltGlareInnerStyle = jsTiltGlareInner.style;
    jsTiltGlareInnerStyle.position = "absolute"; jsTiltGlareInnerStyle.top = "50%"; jsTiltGlareInnerStyle.left = "50%";
    jsTiltGlareInnerStyle.pointerEvents = "none";
    jsTiltGlareInnerStyle.backgroundImage = `linear-gradient(0deg, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 100%)`;
    jsTiltGlareInnerStyle.width = `${this.element.offsetWidth * 2}px`;
    jsTiltGlareInnerStyle.height = `${this.element.offsetHeight * 2}px`;
    jsTiltGlareInnerStyle.transform = "rotate(180deg) translate(-50%, -50%)";
    jsTiltGlareInnerStyle.transformOrigin = "0% 0%"; jsTiltGlareInnerStyle.opacity = "0";
  }
  setTransition() {
    clearTimeout(this.transitionTimeout);
    this.element.style.transition = this.settings.speed + "ms " + this.settings.easing;
    if (this.glare && this.glareElement) this.glareElement.style.transition = `opacity ${this.settings.speed}ms ${this.settings.easing}`;
    this.transitionTimeout = setTimeout(() => {
      this.element.style.transition = "";
      if (this.glare && this.glareElement) this.glareElement.style.transition = "";
    }, this.settings.speed);
  }
  moveToStartingPosition() {
    this.event = {
      clientX: this.left + (this.width * (1 + this.settings.startX / this.settings.max)) / 2,
      clientY: this.top + (this.height * (1 + this.settings.startY / this.settings.max)) / 2,
    };
    this.update();
  }
  extendSettings(settings) {
    const newSettings = {};
    for (const key in SETTINGS) { if (key in settings) newSettings[key] = settings[key]; else if (this.element.hasAttribute("data-tilt-" + key)) { const a = this.element.getAttribute("data-tilt-" + key); try { newSettings[key] = JSON.parse(a); } catch (e) { newSettings[key] = a; } } else newSettings[key] = SETTINGS[key]; }
    return newSettings;
  }
  static init(elements, settings) {
    if (elements instanceof Node) elements = [elements];
    if (elements instanceof NodeList) elements = [].slice.call(elements);
    if (!(elements instanceof Array)) return;
    elements.forEach((el) => { if (!("vanillaTilt" in el)) { el.vanillaTilt = new VanillaTilt(el, settings); } });
  }
  onWindowResize() {
    this.updateElementPosition();
    if (this.glare) {
      const existing = this.element.querySelector(".js-tilt-glare");
      if (existing) existing.remove();
      this.prepareGlare();
      this.glareElement = this.element.querySelector(".js-tilt-glare-inner");
    }
  }
  setSize() { this.clientWidth = window.innerWidth || document.documentElement.clientWidth; this.clientHeight = window.innerHeight || document.documentElement.clientHeight; }
}
if (typeof document !== "undefined") {
  window.VanillaTilt = VanillaTilt;
  const tiltEls = document.querySelectorAll("[data-tilt]");
  VanillaTilt.init(tiltEls);
}
