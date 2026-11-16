export const money = n => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2,
}).format(n / 100);

export function localDateKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function salesChart(sales, now = new Date()) {
  return Array.from({length:7}, (_,i)=>{
    const date = new Date(now);
    date.setDate(date.getDate()-6+i);
    const key = localDateKey(date);
    return {
      day: date.toLocaleDateString('en',{weekday:'short'}),
      sales: sales.filter(m=>localDateKey(m.created_at)===key).reduce((sum,m)=>sum+m.total/100,0),
    };
  });
}
