# Flextracker
A simple tracker for simple metrics

FlexTracker allows you to keep track of any metric by simply sending an SMS.

You can define <b>any</b> single or multi-valued metric. It supports optional simple numeric range validation as well.

To save a new measurement, send command <code>s {metric shortname} [{value/s}]</code>

For example. If you defined a metric named <b>temperature</b> with a shortname <b>t</b> and you wanted to record a new value of 36.9C; you would text <code>s t 36.9.</code>. "s" means <b>save</b>.

If the metric accepted multiple values, for exampple if iit was <b>weight</b> and <b>body fat %</b> (e.g. you measured both at the same time), and you defined the shortname as <b>bw</b>, you could text <code>s bw 75 15</code>. Meanining "save body weight 75Kg and 15% body fat"

You can also share your metrics with anyone else, and add to your account metrics that someone else has defined. Check out the community section.