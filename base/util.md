<!--
 * @Author: xuranXYS
 * @LastEditTime: 2023-10-02 15:37:17
 * @GitHub: www.github.com/xiaoxustudio
 * @WebSite: www.xiaoxustudio.top
 * @Description: By xuranXYS
-->
# util.js文件  
```js
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

```
首先是定义了个Stats（统计信息类），大致就是输出设备信息之类的，注释的很明白，差不多就是看头部有无相对应的字符串来判断  
往下翻  
```js

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
    ...
```
可以看到这里对原始的`Object`和`Array`进行了扩展，估计是其他文件会用到  
再往下，我们看到定义了函数的扩展  
```js
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
```
上面的empty根据注释我们知道是在`Function`上面搞了个空函数的方法  
下面用了atob转码了base64，我们打印看看它转出来的是什么东西  
```js
// 控制台console.log输出内容
new Function(`
window.decrypt = buffer => {
  const array = new Uint8Array(buffer)
  for (let i = 0; i < 0x10; i++) {
    array[i] -= 0x80
  }
  return buffer
}
`)()
new Function(`
const {decrypt} = window
window.decrypt = buffer => decrypt(buffer)
`)()
```
ok，那串base64转码后就是上面的这串代码  
第一个Function可以看出定义了一个解密函数，如何解密函数创建了一个`Uint8Array`的数组，将buffer存进去  
写了个循环，0x10是16进制，对应的十进制就是16，所以会循环（0-15）16次  
然后每个循环都执行在array数组的i位置的数值减去 0x80，对应的十进制是128，所以buffer里面的每个值都会减去128  
最后返回减去的结果  
第二个Function就是将刚刚定义的解密函数存储到全局（window）上  
  
然后接着往下，可以看到简单的定义了一个css的扩展，将传进入的链接加个(\\\\)反斜杠
```js
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
```

再往下
```js
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
```
在`EventTarget`添加了继承属性on和off，设置成了`EventTarget.prototype.addEventListener`和removeEventListener  
就是改了个名字，用法不变  
后面哪个是在`Event`的继承上添加了一个`cmdOrCtrlKey`属性，可以get获取  
它会判断你是否是MacOS系统，是的话就使用`Event.metaKey`的值，不是的话就使用`Event.ctrlKey`的值  
你可能会问meta键是什么键？  
在Mac键盘上，就是命令键，不过这个键在Windows键盘上是Windows键，也就是那个win（图标）键

往下翻是定义了一堆的数学方法和转颜色的方法，我这里不多讲，注释很明白  

然后就是`ModuleList`，分析data.js的时候好像讲过，这里就不多讲了  

之后就是  
```js

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
```

还是从`Array`继承并创建了一个类来使用，不过这个的update属性会循环将里面的字符串索引赋值成undifined  
借此达到删除数据的目的

再往下看
```js
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

```
上面的代码定义了个错误报告器  
当工程处于调试状态的时候，会监听我们的错误，并且在document上创建元素来显示错误信息

最后的  
```js
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
```
这最后就是阻止原生的拖拽和右击菜单  
还判断是否是`electron`且`window.devicePixelRatio`不等于-1就设置设备像素比率，传入的参数是像素比率(`引擎内置功能`)  



