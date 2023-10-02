<!--
 * @Author: xuranXYS
 * @LastEditTime: 2023-10-02 20:29:52
 * @GitHub: www.github.com/xiaoxustudio
 * @WebSite: www.xiaoxustudio.top
 * @Description: By xuranXYS
-->
# local.js文件  

其实从文件名称我们就知道这个文件是操作本地化对象的  
打开文件我们可以看到直接是创建了一个`Local`类，一直到文件最后  

看一下全局属性
```js
 /** 激活的语言
   *  @type {string}
   */ active = ''

  /** 选择的语言
   *  @type {string}
   */ language = ''

  /** 文本映射表
   *  @type {Object}
   */ textMap = {}

  /** 引用标签的正则表达式
   *  @type {RegExp}
   */ refRegexp = /<ref:([0-9a-f]{16})>/g

   // 语言重映射表
  langRemap = {
    'zh-HK': 'zh-TW',
    'zh-SG': 'zh-TW',
  }
  ...
```
额，注释好像都很清楚，最下面语言重映射表应该是对特定的语言进行重新映射  

一样，我们先从初始化开始看  
```js
// 初始化
  initialize() {
    this.createTextMap()
    this.compileTextContents()
    this.setLanguage(Stats.debug
    ? Data.config.localization.default
    : Data.globalData.language
    )
  }
```
根据这三个函数，我们大概知道  
首先是创建文字映射  
其次是编译文本内容  
最后就是设置语言  

那么我们一下`this.createTextMap()`是怎么写的  
```js
// 创建本地化映射表
  createTextMap() {
    const map = this.textMap
    const set = (items) => {
      for (const item of items) {
        if (item.children) {
          set(item.children)
        } else {
          map[item.id] = item
        }
      }
    }
    set(Data.localization.list)
  }
```
可以看到，首先是将`this.textMap`重新赋值到map  
然后写了个set函数，传入一个items，对这个items进行遍历  
如果item有`children`这个属性，就循环调用set  
没有的话就在map里面添加id，值为item  
（什么时候有`children`属性呢，就是我们在本地化创建文件夹的时候）  

```json
[
    {
        "class": "folder",
        "name": "测试",
        "expanded": true,
        "children": [
            {
                "id": "ba896ccbb9c87bc8",
                "name": "",
                "contents": {
                    "en": "hello",
                    "zh-CN": "新的开始"
                }
            }
        ]
    }
]
```
假如我们有如上数据，那么最后map里面的值就会是  
```json
// map
{
    "ba896ccbb9c87bc8":{
        "id": "ba896ccbb9c87bc8",
        "name": "",
        "contents": {
            "en": "hello",
            "zh-CN": "新的开始"
        }
    }
}
```
最后我们设置了`Data.localization.list`来进行解析  

ok，那么继续看一下`this.compileTextContents()`的代码  
```js
// 编译文本内容
  compileTextContents() {
    const regexp = /<global:([0-9a-f]{16})>/g
    const compile = content => {
      const slices = []
      const setters = []
      let li = 0
      let match
      while (match = regexp.exec(content)) {
        const mi = match.index
        if (mi > li) {
          slices.push(content.slice(li, mi))
        }
        const index = slices.length
        const key = match[1]
        const getter = () => Variable.get(key)
        const setter = () => slices[index] = getter()
        setters.push(setter)
        slices.push('')
        li = regexp.lastIndex
      }
      // 无匹配标签的情况
      if (li === 0) {
        return content
      }
      // 找到标签的情况
      if (content.length > li) {
        slices.push(content.slice(li))
      }
      return () => {
        for (const setter of setters) {
          setter()
        }
        return slices.join('')
      }
    }
    const languages = Data.config.localization.languages
    for (const {contents} of Object.values(this.textMap)) {
      for (const language of languages) {
        contents[language] = compile(contents[language])
      }
    }
  }
```
别看这么长，其实可以分开看  
首先是定义了个正则（目的是获取变量），然后创建了个方法`compile`，分析一下这个方法干了什么  
首先是给我们一个内容的参数，使用循环匹配正则，匹配到了之后就会分割我们的内容，并且将相应位置的变量内容替换成空字符串''   
`index`则存储`slices`（数组）的长度  
`key`匹配了我们的变量id  
`setters`再存储一个将`slices`的`index`的内容替换成`getter`的函数，所以我们刚才替换成的空字符串则会被替换成这个变量内容  
而`getter`函数正是通过`Variable.get`方法来获取变量内容的
最后li存储正则最后一次的index  

后面的也很清楚，它会使用li的值来判断，为0，则没有正则运行（没有使用变量），直接返回内容  
有的话则在`slices`上加上`content.slice(li)`  

啊，为什么要有这段代码  
因为我们这里的`while`匹配正则的过程中只处理了前段，中段（匹配到的内容），后段则没有处理  
但我们不可能在这个循环里面处理后段，因为我们不知道后段还有没有我们需要匹配到的内容  
讲了这么多，其实就是`while`循环最后，未解析的会剩余最后匹配的位置到文本最后的内容没有处理  
所以我们将这段加在`slices`末尾就可以  

最后返回的话是个函数（匿名），遍历setters并运行，最后拼接slices并返回，所以这个函数最终会返回处理好的文本  

ok，看看方法`compile`剩下的代码
```js
const languages = Data.config.localization.languages
    for (const {contents} of Object.values(this.textMap)) {
      for (const language of languages) {
        contents[language] = compile(contents[language])
      }
    }
```
这个就是遍历我们之前所编译的文本映射  
里面会遍历我们的语言组，判断它的语言是否在我们所设置的语言（设置的语言肯定是我们已经设置好了的）内  
那么就会将`contents`对应`language`赋值`compile(contents[language])`函数（这里还没运行）  
所以在指定位置运行一下就是我们本地化后的文本

再往下看有个setLanguage方法，是个异步方法
