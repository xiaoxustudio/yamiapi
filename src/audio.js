'use strict'

// ******************************** 音频管理器 ********************************

const AudioManager = new class {
  /** 音频上下文对象
   *  @type {AudioContext}
   */ context

  /** BGM播放器
   *  @type {AudioPlayer}
   */ bgm

  /** BGS播放器
   *  @type {AudioPlayer}
   */ bgs

  /** CV播放器
   *  @type {AudioPlayer}
   */ cv

  /** SE播放器
   *  @type {MultipleAudioPlayer}
   */ se

  /** SE衰减距离
   *  @type {number}
   */ seAttenuationDistance = 0

  /** SE衰减过渡曲线ID
   *  @type {string}
   */ seAttenuationEasingId = ''

  /** 初始化音频管理器 */
  initialize() {
    // 创建音频上下文
    const context = new AudioContext()
    this.context = context

    // 创建播放器
    const bgm = new AudioPlayer(true)
    const bgs = new AudioPlayer(true)
    const cv = new AudioPlayer(false)
    const se = new MultipleAudioPlayer()
    this.bgm = bgm
    this.bgs = bgs
    this.cv = cv
    this.se = se
    this.seAttenuationDistance = Data.config.soundAttenuation.distance
    this.seAttenuationEasingId = Data.config.soundAttenuation.easingId

    Promise.resolve().then(() => {
      // 创建混响卷积器(比较消耗CPU，放到栈尾执行避免阻塞)
      AudioReverb.getConvolver()
    })

    // 移动设备：切出去的时候暂停播放
    if (Stats.deviceType === 'mobile') {
      document.on('visibilitychange', () => {
        if (context.state === 'running') {
          if (document.hidden) {
            bgm.pause()
            bgs.pause()
            cv.pause()
            se.pause()
          } else {
            bgm.continue()
            bgs.continue()
            cv.continue()
            se.continue()
          }
        }
      })
    }

    // Web模式：按下键盘或鼠标时恢复音频上下文
    // 如果在用户交互前创建了音频上下文
    // 默认被Chrome浏览器挂起以免骚扰用户
    if (context.state === 'suspended') {
      const resume = event => {
        if (context.state === 'suspended') {
          context.resume()
        }
      }
      const statechange = event => {
        if (context.state === 'running') {
          bgm.audio.src &&
          bgm.audio.play()
          bgs.audio.src &&
          bgs.audio.play()
          cv.audio.src &&
          cv.audio.play()
          for (const audio of se.audios) {
            audio.src &&
            audio.play()
          }
          window.off('keydown', resume, {capture: true})
          window.off('mousedown', resume, {capture: true})
          context.off('statechange', statechange)
        }
      }
      // pointerdown不能代替mousedown进行resume
      window.on('keydown', resume, {capture: true})
      window.on('mousedown', resume, {capture: true})
      context.on('statechange', statechange)
    }
  }

  /** 重置所有音频播放器 */
  reset() {
    this.bgm.reset()
    this.bgs.reset()
    this.cv.reset()
    this.se.reset()
  }
}

// ******************************** 音频播放器类 ********************************

class AudioPlayer {
  /** HTML音频元素
   *  @type {HTMLAudioElement}
   */ audio

  /** 媒体元素音频源节点
   *  @type {MediaElementAudioSourceNode}
   */ source

  /** 左右声道控制节点
   *  @type {StereoPannerNode}
   */ panner

  /** 混响(卷积器)节点
   *  @type {ConvolverNode|null}
   */ reverb

  /** 音频保存状态缓存
   *  @type {Object}
   */ cache

  /** 音频默认循环播放
   *  @type {boolean}
   */ defaultLoop

  /** 音量过渡计时器
   *  @type {Timer|null}
   */ volumeTransition

  /** 声像过渡计时器
   *  @type {Timer|null}
   */ panTransition

  /**
   * 单源音频播放器
   * @param {boolean} loop 设置默认播放循环
   */
  constructor(loop) {
    const {context} = AudioManager
    this.audio = new Audio()
    this.source = context.createMediaElementSource(this.audio)
    this.gain = context.createGain()
    this.panner = context.createStereoPanner()
    this.reverb = null
    this.cache = null
    this.volumeTransition = null
    this.panTransition = null
    this.defaultLoop = loop
    this.audio.autoplay = true
    this.audio.loop = loop
    this.audio.guid = ''

    // 连接节点
    this.source.connect(this.gain)
    this.gain.connect(this.panner)
    this.panner.connect(context.destination)
  }

  /**
   * 播放音频文件
   * @param {string} guid 音频文件ID
   * @param {number} [volume] 播放音量[0-1]
   */
  play(guid, volume = 1) {
    if (guid) {
      const audio = this.audio
      if (audio.guid !== guid ||
        audio.readyState !== 4 ||
        audio.ended === true) {
        audio.src = File.getPathByGUID(guid)
        audio.guid = guid
        audio.volume = volume
      }
    }
  }

  /** 停止播放 */
  stop() {
    const audio = this.audio
    audio.pause()
    audio.currentTime = 0
    audio.guid = ''
  }

  /** 暂停播放 */
  pause() {
    const audio = this.audio
    if (audio.duration > 0 &&
      audio.ended === false &&
      audio.paused === false) {
      audio.pause()
    }
  }

  /** 继续播放 */
  continue() {
    const audio = this.audio
    if (audio.duration > 0 &&
      audio.ended === false &&
      audio.paused === true) {
      audio.play()
    }
  }

  /** 保存当前的播放状态 */
  save() {
    const audio = this.audio
    this.cache = {
      guid: audio.guid,
      offset: audio.currentTime,
    }
  }

  /** 恢复保存的播放状态 */
  restore() {
    const cache = this.cache
    if (cache !== null) {
      const audio = this.audio
      audio.src = File.getPathByGUID(cache.guid)
      audio.guid = cache.guid
      audio.currentTime = cache.offset
      this.cache = null
    }
  }

  /**
   * 设置音量
   * @param {number} volume 播放音量[0-1]
   * @param {string} [easingId] 过渡曲线ID
   * @param {number} [duration] 持续时间(毫秒)
   */
  setVolume(volume, easingId, duration) {
    // 如果上一次的音量过渡未结束，移除
    if (this.volumeTransition !== null) {
      this.volumeTransition.remove()
      this.volumeTransition = null
    }
    const {gain} = this.gain
    if (duration > 0) {
      const start = gain.value
      const end = volume
      const easing = Easing.get(easingId)
      // 创建音量过渡计时器
      this.volumeTransition = new Timer({
        duration: duration,
        update: timer => {
          const time = easing.map(timer.elapsed / timer.duration)
          gain.value = Math.clamp(start * (1 - time) + end * time, 0, 1)
        },
        callback: () => {
          this.volumeTransition = null
        },
      }).add()
    } else {
      // 直接设置音量
      gain.value = Math.clamp(volume, 0, 1)
    }
  }

  /**
   * 设置声像(左右声道音量)
   * @param {number} pan 声像[-1~+1]
   * @param {string} [easingId] 过渡曲线ID
   * @param {number} [duration] 持续时间(毫秒)
   */
  setPan(pan, easingId, duration) {
    // 如果上一次的声像过渡未结束，移除
    if (this.panTransition !== null) {
      this.panTransition.remove()
      this.panTransition = null
    }
    const panner = this.panner.pan
    if (duration > 0) {
      const start = panner.value
      const end = pan
      const easing = Easing.get(easingId)
      // 创建声像过渡计时器
      this.panTransition = new Timer({
        duration: duration,
        update: timer => {
          const time = easing.map(timer.elapsed / timer.duration)
          panner.value = Math.clamp(start * (1 - time) + end * time, -1, 1)
        },
        callback: () => {
          this.panTransition = null
        },
      }).add()
    } else {
      // 直接设置声像
      panner.value = Math.clamp(pan, -1, 1)
    }
  }

  /**
   * 设置混响
   * @param {number} dry 干声增益[0-1]
   * @param {number} wet 湿声增益[0-1]
   * @param {string} [easingId] 过渡曲线ID
   * @param {number} [duration] 持续时间(毫秒)
   */
  setReverb(dry, wet, easingId, duration) {
    if (this.reverb === null && !(
      dry === 1 && wet === 0)) {
      // 满足条件时创建混响管理器
      new AudioReverb(this)
    }
    if (this.reverb !== null) {
      // 设置混响参数(混响管理器可能被删除)
      this.reverb.set(dry, wet, easingId, duration)
    }
  }

  /**
   * 设置循环
   * @param {boolean} loop 循环播放
   */
  setLoop(loop) {
    this.audio.loop = loop
  }

  /** 重置音频播放器 */
  reset() {
    this.stop()
    this.setVolume(1)
    this.setPan(0)
    this.setReverb(1, 0, '', 0)
    this.setLoop(this.defaultLoop)
    this.cache = null
  }
}

// ******************************** 多源音频播放器类 ********************************

class MultipleAudioPlayer {
  /**
   * 备用的音频元素池
   * @type {Array<HTMLAudioElement>}
   */ audioPool

  /**
   * 正在播放的音频元素列表
   * @type {Array<HTMLAudioElement>}
   */ audios

  /** 左右声道控制节点
   *  @type {StereoPannerNode}
   */ panner

  /** 混响(卷积器)节点
   *  @type {ConvolverNode|null}
   */ reverb

  /** 音量过渡计时器
   *  @type {Timer|null}
   */ volumeTransition

  /** 声像过渡计时器
   *  @type {Timer|null}
   */ panTransition

  /** 多源音频播放器 */
  constructor() {
    const {context} = AudioManager
    this.audioPool = []
    this.audios = []
    this.gain = context.createGain()
    this.panner = context.createStereoPanner()
    this.reverb = null
    this.volumeTransition = null
    this.panTransition = null

    // 连接节点
    this.gain.connect(this.panner)
    this.panner.connect(context.destination)
  }

  /** 获取音频元素 */
  getAudio() {
    let audio = this.audioPool.pop()
    if (audio === undefined) {
      audio = new Audio()
      const source = AudioManager.context.createMediaElementSource(audio)
      const onStop = () => {
        if (this.audios.remove(audio)) {
          this.audioPool.push(audio)
          source.disconnect(this.gain)
        }
      }
      audio.onStop = onStop
      audio.autoplay = true
      audio.source = source
      audio.on('ended', onStop)
      audio.on('error', onStop)
    }
    this.audios.push(audio)
    audio.source.connect(this.gain)
    return audio
  }

  /**
   * 获取不久前的音频元素
   * @param {string} guid 音频文件ID
   * @returns {audio|undefined}
   */
  getRecentlyAudio(guid) {
    for (const audio of this.audios) {
      if (audio.guid === guid && audio.currentTime < 0.05) {
        return audio
      }
    }
    return undefined
  }

  /**
   * 播放音频文件
   * @param {string} guid 音频文件ID
   * @param {number} [volume] 播放音量[0-1]
   * @param {number} [playbackRate] 播放速度
   */
  play(guid, volume = 1, playbackRate = 1) {
    if (guid) {
      const audio = this.getRecentlyAudio(guid)
      if (audio) {
        audio.volume = Math.max(audio.volume, volume)
      } else {
        const audio = this.getAudio()
        audio.guid = guid
        audio.src = File.getPathByGUID(guid)
        audio.volume = volume
        audio.playbackRate = playbackRate
      }
    }
  }

  /**
   * 播放音频文件(距离衰减)
   * @param {string} guid 音频文件ID
   * @param {Object} location 具有场景坐标的对象
   * @param {number} [volume] 播放音量[0-1]
   * @param {number} [playbackRate] 播放速度
   */
   playAt(guid, location, volume = 1, playbackRate = 1) {
    if (guid) {
      const dist = Math.dist(Camera.x, Camera.y, location.x, location.y)
      if (dist < AudioManager.seAttenuationDistance) {
        const easing = Easing.get(AudioManager.seAttenuationEasingId)
        const attenuation = easing.map(dist / AudioManager.seAttenuationDistance)
        const finalVolume = volume * (1 - attenuation)
        this.play(guid, finalVolume, playbackRate)
      }
    }
  }

  /** 停止播放 */
  stop() {
    const {audios} = this
    let i = audios.length
    while (--i >= 0) {
      audios[i].src = ''
      audios[i].onStop()
    }
  }

  /** 暂停播放 */
  pause() {
    for (const audio of this.audios) {
      if (audio.ended === false &&
        audio.paused === false) {
        audio.pause()
      }
    }
  }

  /** 继续播放 */
  continue() {
    for (const audio of this.audios) {
      if (audio.ended === false &&
        audio.paused === true) {
        audio.play()
      }
    }
  }

  /**
   * 设置音量
   * @param {number} volume 播放音量[0-1]
   * @param {string} [easingId] 过渡曲线ID
   * @param {number} [duration] 持续时间(毫秒)
   */
  setVolume(volume, easingId, duration) {
    // 如果上一次的音量过渡未结束，移除
    if (this.volumeTransition !== null) {
      this.volumeTransition.remove()
      this.volumeTransition = null
    }
    const {gain} = this.gain
    if (duration > 0) {
      const start = gain.value
      const end = volume
      const easing = Easing.get(easingId)
      // 创建音量过渡计时器
      this.volumeTransition = new Timer({
        duration: duration,
        update: timer => {
          const time = easing.map(timer.elapsed / timer.duration)
          gain.value = Math.clamp(start * (1 - time) + end * time, 0, 1)
        },
        callback: () => {
          this.volumeTransition = null
        },
      }).add()
    } else {
      // 直接设置音量
      gain.value = Math.clamp(volume, 0, 1)
    }
  }

  /**
   * 设置声像(左右声道音量)
   * @param {number} pan 声像[-1~+1]
   * @param {string} [easingId] 过渡曲线ID
   * @param {number} [duration] 持续时间(毫秒)
   */
  setPan(pan, easingId, duration) {
    if (this.panTransition !== null) {
      this.panTransition.remove()
      this.panTransition = null
    }
    const panner = this.panner.pan
    if (duration > 0) {
      const start = panner.value
      const end = pan
      const easing = Easing.get(easingId)
      this.panTransition = new Timer({
        duration: duration,
        update: timer => {
          const time = easing.map(timer.elapsed / timer.duration)
          panner.value = Math.clamp(start * (1 - time) + end * time, -1, 1)
        },
        callback: () => {
          this.panTransition = null
        },
      }).add()
    } else {
      panner.value = Math.clamp(pan, -1, 1)
    }
  }

  /**
   * 设置混响
   * @param {number} dry 干声增益[0-1]
   * @param {number} wet 湿声增益[0-1]
   * @param {string} [easingId] 过渡曲线ID
   * @param {number} [duration] 持续时间(毫秒)
   */
  setReverb(dry, wet, easingId, duration) {
    if (this.reverb === null && !(
      dry === 1 && wet === 0)) {
      new AudioReverb(this)
    }
    if (this.reverb !== null) {
      this.reverb.set(dry, wet, easingId, duration)
    }
  }

  /**
   * 设置循环
   * @param {boolean} loop 循环播放
   */
  setLoop(loop) {
    for (const audio of this.audios) {
      audio.loop = loop
    }
  }

  /** 重置音频播放器 */
  reset() {
    this.stop()
    this.setVolume(1)
    this.setPan(0)
    this.setReverb(1, 0, '', 0)
    this.setLoop(false)
  }
}

// ******************************** 音频混响类 ********************************

class AudioReverb {
  player      //:object
  input       //:object
  output      //:object
  dryGain     //:object
  wetGain     //:object
  convolver   //:object
  dry         //:number
  wet         //:number
  transition  //:object

  /**
   * 音频混响
   * @param {AudioPlayer|MultipleAudioPlayer} player 音频播放器实例
   */
  constructor(player) {
    const {context} = AudioManager
    this.player = player
    this.input = player.panner
    this.output = context.destination
    this.dryGain = context.createGain()
    this.wetGain = context.createGain()
    this.convolver = AudioReverb.getConvolver()
    this.dry = -1
    this.wet = -1
    this.transition = null

    // 连接节点
    this.connect()
  }

  /** 连接节点 */
  connect() {
    this.player.reverb = this
    this.input.disconnect(this.output)
    this.input.connect(this.dryGain)
    this.dryGain.connect(this.output)
    this.input.connect(this.wetGain)
    this.wetGain.connect(this.convolver)
  }

  /** 断开节点 */
  disconnect() {
    this.player.reverb = null
    this.input.disconnect(this.dryGain)
    this.dryGain.disconnect(this.output)
    this.input.disconnect(this.wetGain)
    this.wetGain.disconnect(this.convolver)
    this.input.connect(this.output)
  }

  /**
   * 设置混响参数
   * @param {number} dry 干声增益[0-1]
   * @param {number} wet 湿声增益[0-1]
   * @param {string} easingId 过渡曲线
   * @param {number} duration 持续时间(毫秒)
   */
  set(dry, wet, easingId, duration) {
    // 如果上一次的混响过渡未结束，移除
    if (this.transition !== null) {
      this.transition.remove()
      this.transition = null
    }
    if (duration > 0) {
      if (this.dry === null) {
        this.setDry(1)
        this.setWet(0)
      }
      const startDry = this.dry
      const startWet = this.wet
      const easing = Easing.get(easingId)
      // 创建混响过渡计时器
      this.transition = new Timer({
        duration: duration,
        update: timer => {
          const time = easing.map(timer.elapsed / timer.duration)
          this.setDry(startDry * (1 - time) + dry * time)
          this.setWet(startWet * (1 - time) + wet * time)
        },
        callback: () => {
          this.transition = null
          if (dry === 1 && wet === 0) {
            this.disconnect()
          }
        },
      }).add()
    } else {
      // 直接设置混响
      this.setDry(dry)
      this.setWet(wet)
      // 如果没有混响，断开连接
      if (dry === 1 && wet === 0) {
        this.disconnect()
      }
    }
  }

  /**
   * 设置干声
   * @param {number} dry 干声增益[0-1]
   */
  setDry(dry) {
    if (this.dry !== dry) {
      this.dry = dry
      this.dryGain.gain.value = dry
    }
  }

  /**
   * 设置湿声
   * @param {number} wet 湿声增益[0-1]
   */
  setWet(wet) {
    if (this.wet !== wet) {
      this.wet = wet
      this.wetGain.gain.value = wet * 2
    }
  }

  /**
   * 获取卷积器
   * @returns {ConvolverNode}
   */
  static getConvolver() {
    if (!AudioReverb.convolver) {
      const PREDELAY = 0.1
      const DECAYTIME = 2
      const context = AudioManager.context
      const duration = PREDELAY + DECAYTIME
      const sampleRate = context.sampleRate
      const sampleCount = Math.round(sampleRate * duration)
      const convolver = context.createConvolver()
      const filter = context.createBiquadFilter()
      const buffer = context.createBuffer(2, sampleCount, sampleRate)
      const bufferLength = buffer.length
      const delayLength = Math.round(bufferLength * PREDELAY / duration)
      const decayLength = Math.round(bufferLength * DECAYTIME / duration)
      const random = Math.random
      for (let i = 0; i < buffer.numberOfChannels; i++) {
        const samples = buffer.getChannelData(i)
        for (let i = 0; i < delayLength; i++) {
          samples[i] = (random() * 2 - 1) * i / delayLength
        }
        for (let i = delayLength; i < bufferLength; i++) {
          const time = (bufferLength - i) / decayLength
          samples[i] = (random() * 2 - 1) * time
        }
      }
      convolver.buffer = buffer
      filter.type = 'lowpass'
      filter.frequency.value = 3000
      convolver.connect(filter)
      filter.connect(context.destination)
      AudioReverb.convolver = convolver
    }
    return AudioReverb.convolver
  }

  // 共享卷积器
  static convolver
}