<!--
 * @Author: xuranXYS
 * @LastEditTime: 2023-09-30 19:24:23
 * @GitHub: www.github.com/xiaoxustudio
 * @WebSite: www.xiaoxustudio.top
 * @Description: By xuranXYS
-->
# data.js

```js
'use strict'

// ******************************** 数据对象 ********************************
const Data = new class {
  // 游戏数据
  manifest
  actors
  skills
  triggers
  items
  equipments
  states
  events
  scripts
  easings
  teams
  autotiles
  variables
  attribute
  enumeration
  plugins
  commands
  config
  scenes = {}
  ui
  animations
  particles
  tilesets
  globalData

  // 文件名GUID正则表达式
  fileGuidRegExp = /[./]([0-9a-f]{16})\.\S+$/
...
```
它首先定义了一个Data的类  
从结构上我们可以推断出它大概是存放各种数据的类

我们先看下它的初始化事件  
``` js
/**
   * 初始化数据管理器
   * @returns {Promise}
   */
  initialize() {
    // 侦听窗口关闭前事件
    Game.on('quit', () => {
      Data.saveGlobalData()
    })

    // 加载数据文件
    return Promise.all([
      // 优先加载属性和枚举用于编译事件
      this.loadFile('attribute'),
      this.loadFile('enumeration'),
      this.loadFile('localization'),
      this.loadObjects(),
      this.loadScripts(),
      this.loadFile('easings'),
      this.loadFile('teams'),
      this.loadFile('autotiles'),
      this.loadFile('variables'),
      this.loadFile('plugins'),
      this.loadFile('commands'),
      this.loadGlobalData()
    ]).then(() => {
      this.createAutotileMap()
      this.createEasingMap()
    })
  }
```

首先是加了个关闭的监听事件，如果窗口关闭就保存数据  
然后是使用promise.all等待各个加载事件，因为是使用的promise.all，所以我们推断出这些加载事件都是使用的promise来返回结果的  
最后是创建了自动图块映射表和创建过渡映射表，根据作者注释我们也知道为什么最后才创建这两个东西  
  
  `loadFile`方法出现的很多，我们看看它到底干了什么
```js
  /**
   * 加载数据文件
   * @param {string} filename /data目录下的文件名
   * @returns {Promise<object>}
   */
  loadFile(filename) {
    return this[filename] = File.get({
      path: `Data/${filename}.json`,
      type: 'json',
      sync: true,
    }).then(data => {
      return this[filename] = data
    })
  }
```


使用了File.get来读取文件，最后返回读取的结果存储到全局Data里面（this[filename]）
我们大概去看看File类里面的get方法是怎么封装的

```js
  /**
   * 获取文件
   * @param {Object} descriptor 文件描述器
   * @returns {Promise<Object|Image|null>}
   */
get(descriptor) {
    // 可以指定路径或GUID来加载文件
    const path = descriptor.path ?? this.getPathByGUID(descriptor.guid)
    const sync = descriptor.sync
    const type = descriptor.type
    switch (type) {
      case 'image': {
        const {loadingPromises} = this
        // 如果当前图像已在加载中，则返回Promise，否则新建
        return loadingPromises[path] || (
        loadingPromises[path] = new Promise(async resolve => {
          const image = new Image()
          // 给图像元素设置guid用于纹理的查找
          image.guid = descriptor.guid ?? ''
          let url = path
          let callback
                  ...
```
大概意思就是传入的是一个对象，里面描述了文件的路径和类型，还有是否是同步   
最后根据路径或者是GUID读取文件  
  
回到我们的Data类，我们知道了loadfile也是一样的操作，只是加了读取的模板用于读取对应的json文件
然后我们发现了三个不一样的加载
```js
this.loadObjects(),
this.loadScripts(),
this.loadGlobalData()
```
我们首先看看`loadObjects`方法是如何写的
```js
 const {manifest} = this
    const idDescriptor = {value: ''}
    const pathDescriptor = {value: ''}
    const filenameDescriptor = {value: ''}
    const idAndPathDescriptors = {
      id: idDescriptor,
      path: pathDescriptor,
    }
if (manifest.deployed) {
      // 加载已打包的数据
      for (const key of [
        'actors',
        'skills',
        'triggers',
        'items',
        'equipments',
        'states',
        'events',
        'ui',
        'animations',
        'particles',
        'tilesets',
      ]) {
        const group = this[key] = manifest[key]
        for (const [guid, data] of Object.entries(group)) {
          idDescriptor.value = guid
          pathDescriptor.value = `File.${guid}`
          Object.defineProperties(data, idAndPathDescriptors)
        }
      }
    } else {
      ...
```
这个方法判断了我们的数据是否是部署的  
如果部署了就循环我们的加载我们打包过后的actors,skills文件添加idAndPathDescriptors模板的属性（这时候的manifest里面的对象都是加载过后的对象，也就是说不只是有path和id的属性，而是一个完整的对象）  
如果是在编辑器里面运行就执行就只是添加我们的idAndPathDescriptors模板的属性（只有path和id的属性）  

最后会执行`precompile`方法

```js
  /** 预编译对象数据 */
  async precompile() {
    await this.attribute
    await this.enumeration
    Attribute.initialize()
    Enum.initialize()
    this.precompileActors()
    this.precompileSkills()
    this.precompileTriggers()
    this.precompileItems()
    this.precompileEquipments()
    this.precompileStates()
    this.precompileAnimations()
  }
```

这是个异步方法，会首先等待我们的attribute和enumeration是否存在
然后会初始化Attribute,Enum这两个类  
最后预编译我们的Actors、Skills、Triggers、Items、Equipments、States、Animations
预编译需要使用刚刚实例化的两个类，最后compileEvents编译文件里面的事件指令

然后再看我们的`loadScripts`方法是怎么写的
```js
/** 加载脚本文件(动态导入模块) */
  async loadScripts() {
    this.remapScripts()
    const promises = []
    const scripts = this.scripts = {}
    // 动态导入所有脚本文件
    for (const meta of this.manifest.script) {
      const promise = import(`../${meta.path}`)
      promise.meta = meta
      promises.push(promise)
    }
    for (const promise of promises) {
      try {
        // 等待导入完成，获取构造函数
        const module = await promise
        const constructor = module.default
        if (typeof constructor === 'function') {
          const {meta} = promise
          constructor.guid = meta.guid
          scripts[meta.guid] = {
            constructor: constructor,
            parameters: meta.parameters ?? [],
          }
        }
      } catch (error) {
        console.error(error)
      }
    }
  }

  /** 重新映射脚本路径(TS->JS) */
  remapScripts() {
    if (this.manifest.deployed) return
    const {outDir} = this.config.script
    const tsExtname = /\.ts$/
    const tsOutDir = outDir.replace(/\/$/, '')
    for (const meta of this.manifest.script) {
      if (tsExtname.test(meta.path)) {
        meta.path = meta.path
        .replace('Assets', tsOutDir)
        .replace(tsExtname, '.js')
      }
    }
  }

```
一样的是个异步方法，首先会执行`remapScripts`方法重新设置脚本的路径（是将ts文件的路径从assets替换到我们设置的输出路径）  
当然如果是js文件则不会进行任何操作，组后循环导入脚本

最后我们看看`loadGlobalData`方法怎么写的

```js
/**
   * 从文件中加载全局数据
   * @returns {Promise<undefined>}
   */
  async loadGlobalData() {
    Game.on('ready', () => {
      delete Data.globalData
    })
    let shell = Stats.shell
    if (!Stats.debug && Stats.isMacOS()) {
      shell = 'web'
    }
    switch (shell) {
      case 'electron':
        try {
          const path = File.route('$/Save/global.save')
          const fsp = require('fs').promises
          const json = await fsp.readFile(path)
          this.globalData = JSON.parse(json)
        } catch (error) {
          this.globalData = {
            language: Data.config.localization.default,
            variables: {},
          }
        }
        break
      case 'web': {
        const key = 'global.save'
        const data = await IDB.getItem(key)
        this.globalData = data ?? {
          language: Data.config.localization.default,
          variables: {},
        }
        break
      }
    }
  }
```
从代码可以看出我们添加了个`ready`监听事件，当`ready`信号发送后，删除我们临时存储的globalData数据   
因为我们之前的main.js里面是先加载Promise.all，然后执行第二个Promise.all，然后进行一些操作后才会发送ready信号   
然后下面的会判断我们是在哪个环境运行的，如果是`electron`就会用fs库来读取文件，是`web`环境的话就会用IDB来读取

你可能会好奇IDB是什么，那我们就来看看IDB是什么。
我们在data.js文件往下翻会看到
```js
/ ******************************** 索引数据库封装对象 ********************************

const IDB = new class {
  // 数据库Promise
  promise

  /**
   * 打开数据库
   * @returns {Promise<IDBObjectStore>}
   */
  open() {
    ...
```
根据作者的注释我们知道IDB就是indexedDB的简称，作者扩展了一部分功能  
localStorage数据容量有限，indexedDB可以存放大量数据，这个是作者注释的原话




