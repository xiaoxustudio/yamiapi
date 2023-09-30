<!--
 * @Author: xuranXYS
 * @LastEditTime: 2023-09-30 14:52:53
 * @GitHub: www.github.com/xiaoxustudio
 * @WebSite: www.xiaoxustudio.top
 * @Description: By xuranXYS
-->

# main.js文件  
```javascript
const Game = new class {
  // 游戏更新器列表
  updaters = new ModuleList()

  // 游戏渲染器列表
  renderers = new ModuleList()

  // 游戏事件侦听器列表
  listeners = {
    ready: [],
    reset: [],
    quit: [],
  }
...
```

首先映入眼帘的就是一个const Game的类  
这个类是形成我们游戏的基础（生命周期） 

我们可以看到游戏的`updaters`、`renderers`都实例化了一个`ModuleList`列表，那我们转到`ModuleList`的类看看这个类干了什么  
经过一番查找，我们知道了这个类在util文件里面(330行)  
```javascript
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
...
```

从上面可以知道`ModuleList`继承了js原本的`Array`并做了扩展和修改  
增加了（渲染，更新）（其他）等操作  
前两个则会调用添加进来的对象里面对应的渲染，更新方法来实现每帧的更新和渲染

ok 回到我们的`Game`类上

```js
// 游戏事件侦听器列表
  listeners = {
    ready: [],
    reset: [],
    quit: [],
  }
```
然后定义了一个对象，用于存放对应事件，因为事件可能有多个，所以用的是数组

初始化方法
```js


  /** 初始化游戏 */
  async initialize() {
    // 优先初始化以下内容
    await Promise.all([
      Stage.initialize(),
      Data.loadMeta(),
      Time.initialize(),
      Game.update(Time.timestamp),
    ])

    // 等待数据和字体加载完成
    await Promise.all([
      Data.initialize(),
      Printer.initialize(),
    ])

    // 设置更新器
    Game.updaters = new ModuleList(
      File,
      Input,
      Timer,
      Scene,
      EventManager,
      Trigger,
      UI,
      CacheList,
      Callback,
    )

    // 设置渲染器
    Game.renderers = new ModuleList(
      OffscreenStart,
      Scene,
      OffscreenEnd,
      UI,
    )

    // 初始化组件对象
    AudioManager.initialize()
    Local.initialize()
    Input.initialize()
    Mouse.initialize()
    Controller.initialize()
    UI.initialize()
    Camera.initialize()
    Scene.initialize()
    Actor.initialize()
    ActorCollider.initialize()
    Animation.initialize()
    Trigger.initialize()
    Easing.initialize()
    Team.initialize()
    Variable.initialize()
    Command.initialize()
    EventManager.initialize()
    PluginManager.initialize()
    ErrorReporter.initialize()
    Party.initialize()

    // 侦听exit事件
    window.on('beforeunload', () => {
      Game.emit('quit')
    })

    // 触发ready事件
    Game.emit('ready')

    // 开始游戏
    Game.start()
  }
```

根据引擎作者的注释，我们知道它是先执行了  
舞台的初始化  
数据的加载元数据  
时间的初始化  
游戏的更新  
操作，然后才是加载数据，设置更新器，渲染器，然后初始化各个组件，最后触发`ready`事件，然后调用`Game.start`方法

我们看看`start`方法干了什么

```js
 /** 开始游戏 */
  start() {
    EventManager.callSpecialEvent('startup')
    EventManager.callAutorunEvents()
  }
```
它执行了EventManager的两个方法  
`callSpecialEvent`：执行特殊事件（游戏启动、存档加载结束、场景初始化、显示文本、显示选项），而这里只执行了游戏启动的特殊事件  
`callAutorunEvents`：执行自动事件（可能有多个自动执行事件）  

然后其他的函数作者已经注释的很明白了，我这里就不多讲
最后  
```js
// ******************************** 主函数 ********************************

!function main () {
  Game.initialize()
}()
```
这里自动执行了游戏的初始化  
  
main.js文件就分析到这里
