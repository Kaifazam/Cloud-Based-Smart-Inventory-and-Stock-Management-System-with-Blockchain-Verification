import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {LayoutDashboard, Package, ArrowLeftRight, ShoppingBag, TriangleAlert, ChartNoAxesCombined, ShieldCheck, LogOut, Search, Plus, X, ArrowUpRight, Boxes, Download, Pencil, Trash2, Menu, RefreshCw} from 'lucide-react';
import {ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar} from 'recharts';
import './styles.css';
import {money, salesChart} from './analytics';

const sections=[['Overview',LayoutDashboard],['Products',Package],['Stock movements',ArrowLeftRight],['Sales',ShoppingBag],['Low-stock alerts',TriangleAlert],['Reports & analytics',ChartNoAxesCombined]];
const emptyProduct={name:'',sku:'',category:'Electronics',price:'',stock:'0',threshold:'10'};
async function api(path,method='GET',body){const response=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}); const data=await response.json(); if(!response.ok)throw new Error(data.error||'Request failed');return data;}

function App(){
 const [logged,setLogged]=useState(sessionStorage.getItem('stockwise-demo')==='true');
 const [page,setPage]=useState('Overview'),[data,setData]=useState({products:[],movements:[]}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[query,setQuery]=useState(''),[category,setCategory]=useState('All categories'),[modal,setModal]=useState(null),[form,setForm]=useState({}),[busy,setBusy]=useState(false),[mobile,setMobile]=useState(false);
async function refresh() {
  setError('');

  try {
    const result = await api('/firestore/inventory');
    setData(result);
    return true;
  } catch (e) {
    setError('Cannot load Firestore inventory. Check your Flask backend.');
    return false;
  } finally {
    setLoading(false);
  }
}
// StockWise dashboard data from Firestore
const products = data.products || [];
const movements = data.movements || [];

// Product categories
const categories = [...new Set(
  products.map(p => p.category)
)];

// Low-stock products
const low = products.filter(
  p => p.stock <= p.threshold
);

// Inventory calculations
const units = products.reduce(
  (sum, p) => sum + p.stock, 0
);

const value = products.reduce(
  (sum, p) => sum + p.price * p.stock, 0
);

// Sales calculations
const sales = movements.filter(
  m => m.kind === 'sale'
);

const revenue = sales.reduce(
  (sum, m) => sum + m.total, 0
);

// Sales chart
const chart = salesChart(sales);

// Stock by category
const categoryData = categories.map(name => ({
  name,
  units: products
    .filter(p => p.category === name)
    .reduce((sum, p) => sum + p.stock, 0)
}));

// Search and category filtering
const filtered = products.filter(p => {
  const matchesSearch =
    p.name.toLowerCase().includes(query.toLowerCase()) ||
    p.sku.toLowerCase().includes(query.toLowerCase());

  const matchesCategory =
    category === 'All categories' ||
    p.category === category;

  return matchesSearch && matchesCategory;
});
useEffect(() => {
  if (logged) {
    refresh();
  }
}, [logged]);
 function navigate(p){setPage(p);setQuery('');setCategory('All categories');setMobile(false);setError('');setNotice('');}
 function openProduct(p){setForm(p?{...p,price:p.price/100}:{...emptyProduct});setModal({type:'product',id:p?.id});setError('');}
 function openMovement(kind='in'){setForm({product_id:products[0]?.id||'',quantity:'1',kind,note:''});setModal({type:'movement'});setError('');}
async function submit(e) {
  e.preventDefault();
  setBusy(true);
  setError('');

  try {
    if (modal.type === 'product' && !modal.id) {
      // Create new product in Firestore
      await api('/firestore/products', 'POST', form);
    } else if (modal.type === 'product') {
      await api(
        '/firestore/products/' + modal.id,
        'PUT',
        form
      );
    } else {
    await api('/firestore/movements', 'POST', form);
    }

    setModal(null);

    const updated = await refresh();

    setNotice(
      updated
        ? 'Your changes have been saved.'
        : 'Saved successfully. Retry loading to see the latest stock; do not submit again.'
    );
  } catch (e) {
    setError(e.message);
  } finally {
    setBusy(false);
  }
} async function remove(p){if(!window.confirm(`Delete ${p.name}? Products with transaction history are protected.`))return;try{await api('/firestore/products/'+p.id,'DELETE');await refresh();setNotice('Product deleted.');}catch(e){setError(e.message);}}
 function exportReport(){const rows=[['Name','SKU','Category','Price INR','Stock','Reorder level','Stock value INR'],...products.map(p=>[p.name,p.sku,p.category,p.price/100,p.stock,p.threshold,p.price*p.stock/100])];const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download='stockwise-inventory.csv';a.click();URL.revokeObjectURL(url);setNotice('Inventory report downloaded.');}
 const status=p=>p.stock===0?'Out of stock':p.stock<=p.threshold?'Low stock':'In stock';
 const productTable=(list)=> <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>CATEGORY</th><th>UNIT PRICE</th><th>STOCK</th><th>STATUS</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{list.map(p=><tr key={p.id}><td><div className="product-cell"><span className={'product-icon '+p.category.toLowerCase()}><Package size={20}/></span><div><strong>{p.name}</strong><small>{p.sku}</small></div></div></td><td>{p.category}</td><td>{money(p.price)}</td><td><strong>{p.stock}</strong><span className="muted"> units</span></td><td><span className={'badge '+(p.stock===0?'red':p.stock<=p.threshold?'amber':'green')}>{status(p)}</span></td><td><div className="actions"><button className="icon-button" aria-label={'Edit '+p.name} onClick={()=>openProduct(p)}><Pencil size={15}/></button>{page!=='Overview'&&<button className="icon-button" aria-label={'Delete '+p.name} onClick={()=>remove(p)}><Trash2 size={15}/></button>}</div></td></tr>)}</tbody></table>{!list.length&&<div className="empty">No products match this view.</div>}</div>;
 const movementTable=(list)=><div className="table-scroll"><table><thead><tr><th>PRODUCT / REFERENCE</th><th>TYPE</th><th>QUANTITY</th><th>AMOUNT</th><th>DATE</th><th>NOTE</th></tr></thead><tbody>{list.map(m=><tr key={m.id}><td><strong>{m.name}</strong><small>TXN-{String(m.id).padStart(4,'0')}</small></td><td><span className={'badge '+(m.kind==='in'?'green':m.kind==='sale'?'blue':'amber')}>{m.kind==='in'?'Stock in':m.kind==='sale'?'Sale':'Stock out'}</span></td><td>{m.quantity}</td><td>{m.kind==='sale'?money(m.total):'—'}</td><td>{new Date(m.created_at).toLocaleDateString('en-IN')}</td><td>{m.note||'—'}</td></tr>)}</tbody></table>{!list.length&&<div className="empty">No transactions yet. Record your first movement.</div>}</div>;
 if(!logged)return <div className="login-layout"><section className="login-brand"><div className="brand"><span className="brand-mark"><Boxes/></span>stockwise<span className="brand-dot">.</span></div><div><span className="eyebrow light">A CLEARER VIEW OF YOUR INVENTORY</span><h1>Every product.<br/>Every movement.<br/><em>Under control.</em></h1><p>One workspace to manage stock, track sales, and make confident inventory decisions.</p><div className="login-features"><span><ShieldCheck size={18}/> Built for what comes next</span><span><ChartNoAxesCombined size={18}/> Insights that move you forward</span></div></div><small>Cloud-Based Smart Inventory & Stock Management System</small></section><section className="login-panel"><div className="login-box"><span className="badge green">PHASE 01 · LOCAL DEMO</span><h2>Welcome back</h2><p>Sign in to your inventory workspace.</p><form onSubmit={e=>{e.preventDefault();sessionStorage.setItem('stockwise-demo','true');setLogged(true);}}><label>Email address<input type="email" required defaultValue="admin@stockwise.demo" autoComplete="username"/></label><label>Password<input type="password" required minLength={6} defaultValue="demo123" autoComplete="current-password"/></label><button className="primary full">Enter demo workspace <ArrowUpRight size={18}/></button></form><div className="demo-note"><ShieldCheck size={19}/><p><strong>Demo access</strong><br/>Use any email and a password of 6+ characters. This is a local UI demo; Firebase authentication will be connected in Phase 2.</p></div></div></section></div>;
 return <div className="app-shell"><aside className={'sidebar '+(mobile?'open':'')}><div className="brand"><span className="brand-mark"><Boxes size={24}/></span>stockwise<span className="brand-dot">.</span></div><div className="workspace-label">WORKSPACE</div><nav>{sections.map(([name,Icon])=><button key={name} className={page===name?'active':''} onClick={()=>navigate(name)}><Icon size={19}/>{name}{name==='Low-stock alerts'&&<span className="nav-count">{low.length}</span>}</button>)}</nav><div className="future-card"><ShieldCheck size={24}/><strong>Built on trust.</strong><p>Blockchain verification is coming in a future phase.</p><span>PROJECT ROADMAP <ArrowUpRight size={12}/></span></div><div className="sidebar-footer"><span className="avatar">AD</span><div><strong>Admin user</strong><small>Demo workspace</small></div><button aria-label="Sign out" className="icon-button" onClick={()=>{sessionStorage.removeItem('stockwise-demo');setLogged(false);}}><LogOut size={18}/></button></div></aside>{mobile&&<button className="overlay" aria-label="Close navigation" onClick={()=>setMobile(false)}/>}
 <main><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" onClick={()=>setMobile(true)} aria-label="Open navigation"><Menu/></button>Workspace <span>/</span><strong>{page}</strong></div><div className="topbar-right"><span className="demo-pill"><i/> Sample data</span><span className="avatar small-avatar">AD</span></div></header><div className="content"><div className="page-heading"><div><span className="eyebrow">YOUR INVENTORY, CONNECTED</span><h1>{page==='Overview'?'Inventory overview':page}</h1><p>{page==='Overview'?"Welcome back. Here’s what’s happening with your inventory.":page==='Products'?'A home for every product in your catalog.':page==='Stock movements'?'Track every unit that enters and leaves your inventory.':page==='Sales'?'Record sales and keep inventory in sync.':page==='Low-stock alerts'?'Stay ahead of shortages. Replenish with confidence.':'Turn your inventory data into better decisions.'}</p></div><div className="heading-actions"><button className="secondary" onClick={exportReport}><Download size={16}/> Export report</button><button className="primary" onClick={()=>page==='Sales'?openMovement('sale'):page==='Stock movements'?openMovement():openProduct()}><Plus size={17}/>{page==='Sales'?'Record sale':page==='Stock movements'?'Record movement':'Add product'}</button></div></div>
 {error&&<div role="alert" className="message error">{error}<button onClick={refresh}><RefreshCw size={15}/> Retry</button></div>}{notice&&<div className="message success" role="status">{notice}<button aria-label="Dismiss notification" onClick={()=>setNotice('')}><X size={16}/></button></div>}
 {loading?<div className="empty">Loading your inventory…</div>:<>
 <div className="stats-grid">{[["Total products",products.length,Package,'Across '+categories.length+' categories'],['Inventory value',money(value),Boxes,'Based on current unit prices'],['Sales revenue',money(revenue),ShoppingBag,'All recorded sample & demo sales'],['Low-stock items',low.length,TriangleAlert,'Products at or below reorder level']].map(([label,total,Icon,detail],i)=><div key={label} className={'stat-card stat-'+i}><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon size={18}/></span></div><div className="stat-value">{total}</div><div className="stat-detail">{i===3?<span className="amber-text">Needs attention</span>:<span className="stat-indicator"/>} {detail}</div></div>)}</div>
 {(page==='Overview'||page==='Reports & analytics')&&<><div className="charts-grid"><section className="panel"><div className="panel-heading"><div><h2>Sales performance</h2><p>Your sales activity over the last 7 days</p></div><span className="period">Last 7 days</span></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart} margin={{top:10,right:10,left:5,bottom:0}}><defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#159b7b" stopOpacity={.25}/><stop offset="100%" stopColor="#159b7b" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf0ef"/><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fontSize:12,fill:'#85928d'}} dy={10}/><YAxis axisLine={false} tickLine={false} tick={{fontSize:11,fill:'#85928d'}} tickFormatter={n=>'₹'+n/1000+'k'}/><Tooltip formatter={v=>money(v*100)} contentStyle={{borderRadius:10,border:'1px solid #e3eae6'}}/><Area type="monotone" dataKey="sales" name="Sales" stroke="#13846a" strokeWidth={3} fill="url(#salesFill)"/></AreaChart></ResponsiveContainer></div></section><section className="panel category-panel"><div className="panel-heading"><div><h2>Stock by category</h2><p>{units} units in your inventory</p></div><Boxes size={19} className="muted"/></div><div className="category-list">{categoryData.map((c,i)=><div key={c.name}><div className="category-row"><span><i style={{background:['#13846a','#8fbbaa','#e3ba79','#9ba7cc'][i%4]}}/>{c.name}</span><strong>{c.units}<small> units</small></strong></div><div className="progress"><div style={{width:(units?c.units/units*100:0)+'%',background:['#13846a','#8fbbaa','#e3ba79','#9ba7cc'][i%4]}}/></div></div>)}</div></section></div>{page==='Reports & analytics'&&<section className="panel extra-panel"><div className="panel-heading"><div><h2>Inventory distribution</h2><p>Available units across product categories</p></div></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={categoryData}><CartesianGrid vertical={false}/><XAxis dataKey="name"/><YAxis/><Tooltip/><Bar dataKey="units" fill="#13846a" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div></section>}</>}
 {page==='Overview'&&low.length>0&&<div className="alert-strip"><span className="alert-icon"><TriangleAlert size={19}/></span><div><strong>A little attention goes a long way.</strong><p>{low.length} products are running low or out of stock. Keep your shelves ready.</p></div><button onClick={()=>navigate('Low-stock alerts')}>View alerts <ArrowUpRight size={17}/></button></div>}
 {(page==='Overview'||page==='Products'||page==='Low-stock alerts')&&<section className="panel products-panel"><div className="panel-heading"><div><h2>{page==='Low-stock alerts'?'Replenishment queue':page==='Overview'?'Product inventory':'All products'} <span className="count">{page==='Low-stock alerts'?low.length:products.length}</span></h2><p>{page==='Low-stock alerts'?'At or below the configured reorder level':'Keep a pulse on your products and stock levels'}</p></div>{page==='Overview'&&<button className="text-button" onClick={()=>navigate('Products')}>View all products <ArrowUpRight size={16}/></button>}{page==='Low-stock alerts'&&<button className="secondary" onClick={()=>openMovement('in')}><Plus size={15}/> Restock</button>}</div><div className="table-tools"><label className="search"><Search size={17}/><input aria-label="Search products" placeholder="Search products or SKU…" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="Filter category" value={category} onChange={e=>setCategory(e.target.value)}><option>All categories</option>{categories.map(c=><option key={c}>{c}</option>)}</select></div>{productTable(page==='Low-stock alerts'?filtered.filter(p=>p.stock<=p.threshold):page==='Overview'?filtered.slice(0,5):filtered)}<div className="table-footer">Showing {page==='Overview'?Math.min(filtered.length,5):page==='Low-stock alerts'?filtered.filter(p=>p.stock<=p.threshold).length:filtered.length} products <span>Updated from your local demo database</span></div></section>}
 {(page==='Stock movements'||page==='Sales')&&<section className="panel"><div className="panel-heading"><div><h2>{page==='Sales'?'Sales history':'Movement history'}</h2><p>{page==='Sales'?'Each recorded sale automatically reduces available stock.':'Stock out records non-sale adjustments. Use Sales to record revenue.'}</p></div></div>{movementTable(page==='Sales'?sales:movements)}</section>}
 {page==='Reports & analytics'&&<section className="panel extra-panel"><div className="panel-heading"><div><h2>Inventory valuation report</h2><p>Current stock value: {money(value)} · {units} units · {products.length} products</p></div><button className="secondary" onClick={exportReport}><Download size={16}/> Download CSV</button></div>{productTable(products)}</section>}
 <footer className="content-footer"><span>Stockwise · Smart inventory, better decisions.</span><span><ShieldCheck size={13}/> Phase 1 · Local demo</span></footer></>}
 </div></main>
 {modal&&<div className="modal-backdrop" onClick={()=>!busy&&setModal(null)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e=>e.stopPropagation()}><div className="panel-heading"><div><h2 id="modal-title">{modal.type==='product'?(modal.id?'Edit product':'Add a product'):'Record '+(form.kind==='sale'?'a sale':'stock movement')}</h2><p>{modal.type==='product'?'Build a reliable product catalog.':'Stock levels update when you save.'}</p></div><button className="icon-button" aria-label="Close dialog" disabled={busy} onClick={()=>setModal(null)}><X/></button></div>{error&&<div className="message error" role="alert">{error}</div>}<form onSubmit={submit}>{modal.type==='product'?<><label>Product name<input autoFocus required maxLength={120} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><div className="form-grid"><label>SKU<input required maxLength={40} value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})}/></label><label>Category<input required list="categories" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/><datalist id="categories">{categories.map(c=><option key={c}>{c}</option>)}</datalist></label><label>Unit price (₹)<input type="number" min="0" max="100000000" step="0.01" required value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></label><label>Reorder level<input type="number" min="0" step="1" required value={form.threshold} onChange={e=>setForm({...form,threshold:e.target.value})}/></label>{!modal.id&&<label>Opening stock<input type="number" min="0" step="1" required value={form.stock} onChange={e=>setForm({...form,stock:e.target.value})}/></label>}</div>{modal.id&&<p className="form-help">Use stock movements to adjust existing stock and preserve transaction history.</p>}</>:<><label>Product<select aria-label="Product" required value={form.product_id} onChange={e=>setForm({...form,product_id:e.target.value})}><option value="" disabled>Select a product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} — {p.stock} available</option>)}</select></label><div className="form-grid"><label>Movement type<select aria-label="Movement type" value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})}><option value="in">Stock in</option><option value="out">Stock out</option><option value="sale">Sale</option></select></label><label>Quantity<input type="number" required min="1" step="1" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></label></div>{form.kind==='sale'&&<div className="sale-total">Sale total <strong>{money((products.find(p=>p.id===Number(form.product_id))?.price||0)*Number(form.quantity))}</strong></div>}<label>Note (optional)<input maxLength={250} placeholder="Supplier, order reference, or reason" value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label></>}<div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setModal(null)}>Cancel</button><button className="primary" disabled={busy||modal.type==='movement'&&!products.length}>{busy?'Saving…':'Save '+(modal.type==='product'?'product':'transaction')}</button></div></form></section></div>}
 </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
