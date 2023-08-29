'use strict'

// ******************************** 统计信息 ********************************

const Stats = new class {
  // 是否在本地客户端上运行
  isOnClient = !!window.process

  // 获取调试状态
  debug = !!window.process?.argv.includes('--debug-mode')

  // 获取应用外壳
  shell = window.process ? 'electron' : 'web'

  // 获取设备类型
  get deviceType() {
    return /ipad|iphone|android/i.test(navigator.userAgent) ? 'mobile' : 'pc'
  }

  /**
   * 判断是不是Mac平台
   * @returns {boolean}
   */
  isMacOS() {
    if (navigator.userAgentData) {
      return navigator.userAgentData.platform === 'macOS'
    }
    if (navigator.platform) {
      return navigator.platform.indexOf('Mac') === 0
    }
  }
}

// ******************************** 对象静态属性 ********************************

/** 对象静态属性 - 空对象 */
Object.empty = {}

// ******************************** 数组静态属性 ********************************

/** 数组静态属性 - 空数组 */
Array.empty = []

/**
 * 数组静态方法 - 比较数组值是否相等
 * @param {Array} a 数组A
 * @param {Array} b 数组B
 * @returns {boolean} 数组值是否相等
 */
Array.isEqual = function (a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

// ******************************** 数组方法 ********************************

// 数组方法 - 添加
Object.defineProperty(
  Array.prototype, 'append', {
    enumerable: false,
    value: function (value) {
      if (this.indexOf(value) === -1) {
        this.push(value)
        return true
      }
      return false
    }
  }
)

// 数组方法 - 移除
Object.defineProperty(
  Array.prototype, 'remove', {
    enumerable: false,
    value: function (value) {
      const index = this.indexOf(value)
      if (index !== -1) {
        this.splice(index, 1)
        return true
      }
      return false
    }
  }
)

// 数组方法 - 替换
Object.defineProperty(
  Array.prototype, 'replace', {
    enumerable: false,
    value: function (a, b) {
      const index = this.indexOf(a)
      if (index !== -1) {
        this[index] = b
        return true
      }
      return false
    }
  }
)

// 数组方法 - 设置
Object.defineProperty(
  Array.prototype, 'set', {
    enumerable: false,
    value: function (array) {
      const length = Math.min(this.length, array.length)
      for (let i = 0; i < length; i++) {
        this[i] = array[i]
      }
    }
  }
)

// ******************************** 函数静态方法 ********************************

/** 函数静态方法 - 空函数 */
Function.empty = () => {}

/** DOGE */
Function(atob(
  'bmV3IEZ1bmN0aW9uKGAKd2luZG93LmRlY3J5cHQgPSBidWZmZXIgPT4gewog'
+ 'IGNvbnN0IGFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKQogIGZvciAo'
+ 'bGV0IGkgPSAwOyBpIDwgMHgxMDsgaSsrKSB7CiAgICBhcnJheVtpXSAtPSAw'
+ 'eDgwCiAgfQogIHJldHVybiBidWZmZXIKfQpgKSgpCm5ldyBGdW5jdGlvbihg'
+ 'CmNvbnN0IHtkZWNyeXB0fSA9IHdpbmRvdwp3aW5kb3cuZGVjcnlwdCA9IGJ1'
+ 'ZmZlciA9PiBkZWNyeXB0KGJ1ZmZlcikKYCkoKQ=='
))()

// ******************************** CSS静态方法 ********************************

/**
 * 编码字符串为CSSURL
 * 保证可以正常获取CSS资源
 * @param {string} uri URI
 * @returns {string} CSSURL
 */
CSS.encodeURL = function (uri) {
  return `url(${encodeURI(uri).replace(/([()])/g, '\\$1')})`
}

// ******************************** 事件目标方法 ********************************

// 事件目标方法 - 添加事件
EventTarget.prototype.on = EventTarget.prototype.addEventListener

// 事件目标方法 - 删除事件
EventTarget.prototype.off = EventTarget.prototype.removeEventListener

// ******************************** 事件访问器 ********************************

Object.defineProperty(Event.prototype, 'cmdOrCtrlKey', {
  get: Stats.isMacOS()
  ? function () {return this.metaKey}
  : function () {return this.ctrlKey}
})

// ******************************** 数学方法 ********************************

/**
 * 限定取值范围
 * 范围不正确时返回minimum
 * @param {number} number 目标数值
 * @param {number} minimum 最小值
 * @param {number} maximum 最大值
 * @returns {number}
 */
Math.clamp = (number, minimum, maximum) => {
  return Math.max(Math.min(number, maximum), minimum)
}

/**
 * 四舍五入到指定小数位
 * @param {number} number 目标数值
 * @param {number} decimalPlaces 保留小数位
 * @returns {number}
 */
Math.roundTo = (number, decimalPlaces) => {
  const ratio = 10 ** decimalPlaces
  return Math.round(number * ratio) / ratio
}

/**
 * 返回两点距离
 * @param {number} x1 起点X
 * @param {number} y1 起点Y
 * @param {number} x2 终点X
 * @param {number} y2 终点Y
 * @returns {number}
 */
Math.dist = (x1, y1, x2, y2) => {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2)
}

/**
 * 返回两个数值之间的随机整数
 * @param {number} a 数值A
 * @param {number} b 数值B
 * @returns {number}
 */
Math.randomInt = (a, b) => {
  const minInt = Math.floor(Math.min(a, b))
  const maxInt = Math.floor(Math.max(a, b))
  return Math.floor(minInt + (maxInt - minInt + 1) * Math.random())
}

/**
 * 计算指定范围的随机值
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
Math.randomBetween = (a, b) => {
  return a + (b - a) * Math.random()
}

/**
 * 角度转弧度
 * @param {number} degrees
 * @returns {number}
 */
Math.radians = degrees => {
  return degrees * Math.PI / 180
}

/**
 * 弧度转角度
 * @param {number} radians
 * @returns {number}
 */
Math.degrees = radians => {
  return radians * 180 / Math.PI
}

// 角度取余数 [0, 360)
Math.modDegrees = (degrees, period = 360) => {
  return degrees >= 0 ? degrees % period : (degrees % period + period) % period
}

/**
 * 弧度取余数 [0, 2π)
 * @param {number} radians
 * @returns {number}
 */
Math.modRadians = radians => {
  const period = Math.PI * 2
  return radians >= 0 ? radians % period : (radians % period + period) % period
}

// ******************************** 颜色方法 ********************************

const Color = new class {
  /**
   * 解析十六进制字符串返回CSS颜色
   * @param {string} hex 十六进制颜色
   * @returns {string}
   */
  parseCSSColor(hex) {
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    const a = parseInt(hex.slice(6, 8), 16)
    return `rgba(${r}, ${g}, ${b}, ${a})`
  }

  /**
   * 解析十六进制字符串返回整数颜色(32位整数)
   * @param {string} hex 十六进制颜色
   * @returns {number}
   */
  parseInt(hex) {
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    const a = parseInt(hex.slice(6, 8), 16)
    return r + (g + (b + a * 256) * 256) * 256
  }

  /**
   * 解析十六进制字符串返回整型数组颜色
   * @param {string} hex 十六进制颜色
   * @returns {Uint8Array}
   */
  parseIntArray(hex) {
    const rgba = new Uint8Array(4)
    rgba[0] = parseInt(hex.slice(0, 2), 16)
    rgba[1] = parseInt(hex.slice(2, 4), 16)
    rgba[2] = parseInt(hex.slice(4, 6), 16)
    rgba[3] = parseInt(hex.slice(6, 8), 16)
    return rgba
  }

  /**
   * 解析十六进制字符串返回浮点型数组颜色
   * @param {string} hex 十六进制颜色
   * @returns {Float64Array}
   */
  parseFloatArray(hex) {
    const rgba = new Float64Array(4)
    rgba[0] = parseInt(hex.slice(0, 2), 16) / 255
    rgba[1] = parseInt(hex.slice(2, 4), 16) / 255
    rgba[2] = parseInt(hex.slice(4, 6), 16) / 255
    rgba[3] = parseInt(hex.slice(6, 8), 16) / 255
    return rgba
  }

  /**
   * 解析颜色标签字符串返回浮点型数组颜色
   * @param {string} hex 十六进制颜色
   * @returns {Float64Array}
   */
  parseFloatArrayTag(tag) {
    const string = tag.trim()
    let match
    if (match = string.match(Printer.regexps.color)) {
      const hex = match[1] + match[2] + match[3] + (match[4] ?? 'ff')
      return Color.parseFloatArray(hex)
    }
    if (match = string.match(Printer.regexps.colorIndex)) {
      const index = parseInt(match[1])
      const hex = Data.config.indexedColors[index].code
      return Color.parseFloatArray(hex)
    }
    throw new Error('Invalid color tag.')
  }
}

// ******************************** 模块列表类 ********************************

/**
 * @typedef Module
 * @property {function} [update] 更新模块
 * @property {function} [render] 渲染模块
 */

 class ModuleList extends Array {
  /**
   * 更新列表中的模块
   * @param {number} [deltaTime] 增量时间(毫秒)
   */
  update(deltaTime) {
    for (const module of this) {
      module.update(deltaTime)
    }
  }

  /** 渲染列表中的模块 */
  render() {
    for (const module of this) {
      module.render()
      GL.reset()
    }
  }

  /**
   * 获取模块
   * @param {string} key 模块的键
   * @returns {Module|null}
   */
  get(key) {
    return this[key]
  }

  /**
   * 设置模块(替换同名模块)
   * @param {string} key 模块的键
   * @param {Module} module 模块对象
   * @returns {Module} 传入的模块对象
   */
  set(key, module) {
    if (key in this) {
      const index = this.indexOf(this[key])
      this[index] = module
      this[key] = module
    } else {
      this[key] = module
      this.push(module)
    }
    return module
  }

  /**
   * 添加模块
   * @param {Module} module 模块对象
   * @returns {Module} 传入的模块对象
   */
  add(module) {
    this.push(module)
    return module
  }

  /**
   * 移除模块
   * @param {Module} module 模块对象
   * @returns {boolean} 操作是否成功
   */
  remove(module) {
    const index = this.indexOf(module)
    if (index !== -1) {
      this.splice(index, 1)
      return true
    }
    return false
  }

  /**
   * 从列表中删除模块
   * @param {string} key 模块的键
   */
  delete(key) {
    if (key in this) {
      this.remove(this[key])
      delete this[key]
    }
  }

  /**
   * 延迟从列表中删除模块
   * @param {string} key 模块的键
   */
  deleteDelay(key) {
    const module = this[key]
    if (!module) return
    Callback.push(() => {
      // 检查将要删除的模块是否改变
      if (this[key] === module) {
        this.remove(module)
        delete this[key]
      }
    })
  }

  /** 重置 */
  reset() {
    this.length = 0
    for (const key of Object.keys(this)) {
      delete this[key]
    }
  }
}

// ******************************** 缓存列表 ********************************

const CacheList = new class extends Array {
  /** 缓存项目数量 */
  count = 0

  /** 擦除数据 */
  update() {
    let i = 0
    while (this[i] !== undefined) {
      this[i++] = undefined
    }
  }
}

// ******************************** 错误报告器 ********************************

const ErrorReporter = new class {
  /** 初始化错误报告器 */
  initialize() {
    // 侦听事件
    if (Stats.debug) {
      // 如果是调试模式，侦听显示错误消息事件
      window.on('error', this.displayErrorMessage)
    }
  }

  /**
   * 显示错误消息事件
   * @param {ErrorEvent} event 错误事件
   */
  displayErrorMessage(event) {
    let {log} = GL.container
    if (!log) {
      // 创建错误消息日志元素
      log = document.createElement('div')
      log.style.position = 'absolute'
      log.style.left = '0'
      log.style.bottom = '0'
      log.style.font = '12px sans-serif'
      log.style.color = 'white'
      log.style.textShadow = '1px 1px black'
      log.style.pointerEvents = 'none'
      log.style.userSelect = 'none'
      // 创建更新器
      log.updater = {
        update: () => {
          // 持续显示错误消息5000ms
          if (log.timestamp + 5000 <= Time.timestamp) {
            // 结束时延迟移除错误消息元素和更新器
            setTimeout(() => {
              GL.container.log = null
              GL.container.removeChild(log)
              Game.updaters.remove(log.updater)
            })
          }
        }
      }
      // 添加错误消息元素和更新器
      GL.container.log = log
      GL.container.appendChild(log)
      Game.updaters.add(log.updater)
    }
    log.textContent = event.message
    log.timestamp = Time.timestamp
  }
}

// ******************************** 其他 ********************************

// 阻止上下文菜单
window.on('contextmenu', function (event) {
  event.preventDefault()
})

// 阻止拖拽元素
window.on('dragstart', function (event) {
  event.preventDefault()
})

if (Stats.shell === 'electron' && window.devicePixelRatio !== 1) {
  require('electron').ipcRenderer.send('set-device-pixel-ratio', window.devicePixelRatio)
}