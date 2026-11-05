// Approved menu transcribed from the owner's screenshots. No stock or recipes inferred.
export function seedSayYesMenu(s){
 if(s.menuImports?.includes('sayyes-menu-2026-11-06'))return;
 const entries=[
 ['curd-ring','Творожное колечко',15,'Десерты','Снаружи из заварного теста, а внутри — нежный крем из творога. Классическое или с вкусом на выбор.',[]],
 ['cookie','Кукис',10,'Десерты','Шоколадный с дропсами, плотный, красивый и очень честный.',[]],
 ['date-candies','Финиковые конфеты',5,'Десерты','Финики, кокосовая стружка, орехи и какао без добавленного сахара.',[]],
 ['syrniki','Сырники',20,'Завтраки и тёплые блюда','Три нежных сырника со сметаной и клубничным топингом или сгущенкой. Классические или с курагой на выбор.',[['classic','Классические',0],['apricot','С курагой',0]]],
 ['pancakes','Блины',18,'Завтраки и тёплые блюда','На выбор: классические и с лососем. Подаются со сметаной.',[['classic','Классические',0],['salmon','С лососем',2]]],
 ['mac-cheese','Mac & Cheese',14,'Завтраки и тёплые блюда','Классика, с курицей или с рваной свининой bbq.',[['classic','Классика',0],['chicken','С курицей',2],['pork','С рваной свининой BBQ',4]]],
 ['pumpkin-soup','Тыквенный суп с креветками',25,'Завтраки и тёплые блюда','Сытный, ароматный, с сбалансированным вкусом.',[]]
 ];
 for(const [slug,name,price,category,note,variants] of entries){
  const id='sayyes-menu-'+slug;
  if(!s.products.some(p=>p.id===id))s.products.push({id,name,price,category,note,image:'/menu/'+slug+'.jpg',barKind:'product',unit:'шт',active:true,minQty:0,brand:'SayYes',lossFactor:1,weighted:false,noDiscount:false,recipe:[],yieldQty:1,modifiers:variants.map(([id,name,price])=>({id,name,price,recipe:[]}))});
 }
 s.barCategories??=[];for(const name of new Set(entries.map(e=>e[3])))if(!s.barCategories.some(c=>c.name===name))s.barCategories.push({id:'sayyes-category-'+(name==='Десерты'?'desserts':'breakfast'),name,kind:'menu'});
 s.menuImports??=[];s.menuImports.push('sayyes-menu-2026-11-06');
}
