package ModifierNavigation
  model Controller
    extends Base;
  end Controller;
  model Wrapper
    replaceable model C = Base;
    C item;
  end Wrapper;
end ModifierNavigation;
